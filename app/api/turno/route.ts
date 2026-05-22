import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  verificarPin,
  hashPin,
  pinValido,
  firmarSesion,
  EMPLEADO_COOKIE,
} from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Abre un turno (entrada) desde el celular del local. Sin login: service role.
// Pide PIN (lo crea en el primer fichaje si no tiene). Sube la selfie de entrada.

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
  tipo_jornada: z.enum(["completa", "extra"]).default("completa"),
  extra_modo: z.enum(["cuarto", "medio", "completo", "horas"]).nullable().optional(),
  nota: z.string().max(200).nullable().optional(),
  at: z.string().datetime(),
  manual: z.boolean().default(false),
  foto_base64: z.string().min(100),
});

// NOTE: lockout en memoria, se resetea en cold start (serverless). Tradeoff aceptado para este kiosko.
const intentosPin = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const MAX_ANTIGUEDAD_DIAS = 90;

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) throw new Error("formato de imagen inválido");
  const ext = m[1] === "png" ? "png" : "jpg";
  return { buffer: Buffer.from(m[2]!, "base64"), ext };
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  const cuando = new Date(input.at);
  const ahora = Date.now();
  if (cuando.getTime() > ahora + 2 * 60_000) {
    return NextResponse.json({ error: "No podés fichar en el futuro." }, { status: 400 });
  }
  if (ahora - cuando.getTime() > MAX_ANTIGUEDAD_DIAS * 86_400_000) {
    return NextResponse.json(
      { error: `Solo se pueden cargar fichajes de los últimos ${MAX_ANTIGUEDAD_DIAS} días.` },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: emp, error: empErr } = await db
    .from("employees")
    .select("id, activo, modalidad_pago, pin_hash")
    .eq("id", input.employee_id)
    .maybeSingle();
  if (empErr) return NextResponse.json({ error: "error de base" }, { status: 500 });
  if (!emp || !emp.activo) {
    return NextResponse.json({ error: "empleado inexistente o inactivo" }, { status: 404 });
  }

  const estadoPin = intentosPin.get(input.employee_id);
  if (estadoPin && estadoPin.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos de PIN. Probá en unos minutos." },
      { status: 429 },
    );
  }
  if (emp.pin_hash) {
    const ok = await verificarPin(input.pin, emp.pin_hash);
    if (!ok) {
      const fails = (estadoPin?.fails ?? 0) + 1;
      intentosPin.set(input.employee_id, {
        fails,
        hasta: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
      });
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    }
    intentosPin.delete(input.employee_id);
  } else {
    if (!pinValido(input.pin)) {
      return NextResponse.json({ error: "El PIN debe tener 4 a 8 dígitos" }, { status: 400 });
    }
    const nuevoHash = await hashPin(input.pin);
    const { error: pinErr } = await db
      .from("employees")
      .update({ pin_hash: nuevoHash })
      .eq("id", input.employee_id);
    if (pinErr) return NextResponse.json({ error: "no se pudo guardar el PIN" }, { status: 500 });
  }

  let tipoJornada = input.tipo_jornada;
  let extraModo = input.extra_modo ?? null;
  if (emp.modalidad_pago === "jornada") {
    tipoJornada = "completa";
    extraModo = null;
  } else if (emp.modalidad_pago === "horas") {
    tipoJornada = "extra";
    extraModo = "horas";
  }

  let fotoPath: string | null = null;
  let fotoUrl: string | null = null;
  try {
    const { buffer, ext } = dataUrlToBuffer(input.foto_base64);
    const ym = input.at.slice(0, 7);
    fotoPath = `${input.employee_id}/${ym}/${Date.now()}-entrada.${ext}`;
    const { error: upErr } = await svc.storage
      .from("fichaje-selfies")
      .upload(fotoPath, buffer, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: false,
      });
    if (upErr) throw upErr;
    const { data: signed } = await svc.storage
      .from("fichaje-selfies")
      .createSignedUrl(fotoPath, 3600);
    fotoUrl = signed?.signedUrl ?? null;
  } catch {
    return NextResponse.json({ error: "no se pudo guardar la foto" }, { status: 500 });
  }

  const { data: ins, error: insErr } = await db
    .from("turnos")
    .insert({
      employee_id: input.employee_id,
      tipo_jornada: tipoJornada,
      extra_modo: extraModo,
      nota: input.nota ?? null,
      entrada_at: cuando.toISOString(),
      entrada_foto_path: fotoPath,
      entrada_foto_url: fotoUrl,
      entrada_manual: input.manual,
    })
    .select("id")
    .single();
  if (insErr || !ins) {
    return NextResponse.json({ error: "no se pudo registrar la entrada" }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set(EMPLEADO_COOKIE, await firmarSesion(input.employee_id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true, id: ins.id });
}
