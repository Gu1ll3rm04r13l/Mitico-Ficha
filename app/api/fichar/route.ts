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
import { emparejarFichajes, MAX_TURNO_HORAS } from "@/lib/fichaje/sueldo";
import type { TimeRecord } from "@/lib/fichaje/types";

export const runtime = "nodejs";

// Inserción de fichaje desde el celular del local. Sin login: usa service role.
// Pide PIN del empleado (lo crea en el primer fichaje si no tiene).
// Valida empleado activo, verifica PIN, sube la selfie al bucket privado, inserta el registro.

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
  tipo: z.enum(["entrada", "salida"]),
  tipo_jornada: z.enum(["completa", "extra"]).default("completa"),
  extra_modo: z.enum(["cuarto", "medio", "completo", "horas"]).nullable().optional(),
  nota: z.string().max(200).nullable().optional(),
  foto_base64: z.string().min(100), // dataURL jpeg
});

// Lockout de PIN en memoria: 5 intentos fallidos → 5 min de bloqueo por empleado.
const intentosPin = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) throw new Error("formato de imagen inválido");
  const ext = m[1] === "png" ? "png" : "jpg";
  return { buffer: Buffer.from(m[2]!, "base64"), ext };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos inválidos", detalle: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  // Empleado activo?
  const { data: emp, error: empErr } = await db
    .from("employees")
    .select("id, activo, modalidad_pago, pin_hash")
    .eq("id", input.employee_id)
    .maybeSingle();
  if (empErr) {
    return NextResponse.json({ error: "error de base" }, { status: 500 });
  }
  if (!emp || !emp.activo) {
    return NextResponse.json(
      { error: "empleado inexistente o inactivo" },
      { status: 404 },
    );
  }

  // Lockout de PIN
  const estadoPin = intentosPin.get(input.employee_id);
  if (estadoPin && estadoPin.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos de PIN. Probá en unos minutos." },
      { status: 429 },
    );
  }

  if (emp.pin_hash) {
    // Empleado con PIN: verificar
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
    // Empleado sin PIN: crearlo en este primer fichaje
    if (!pinValido(input.pin)) {
      return NextResponse.json(
        { error: "El PIN debe tener 4 a 8 dígitos" },
        { status: 400 },
      );
    }
    const nuevoHash = await hashPin(input.pin);
    const { error: pinErr } = await db
      .from("employees")
      .update({ pin_hash: nuevoHash })
      .eq("id", input.employee_id);
    if (pinErr) {
      return NextResponse.json(
        { error: "no se pudo guardar el PIN" },
        { status: 500 },
      );
    }
  }

  // Sin rate limit ni bloqueo de doble entrada: puede haber doble jornada y
  // varios empleados fichando seguido. Lo mal cargado se corrige borrando desde
  // el panel admin.
  const ahora = Date.now();

  // Resolver tipo_jornada / extra_modo
  let tipoJornada = input.tipo_jornada;
  let extraModo = input.extra_modo ?? null;

  // Reglas por modalidad al fichar ENTRADA
  if (input.tipo === "entrada") {
    if (emp.modalidad_pago === "jornada") {
      tipoJornada = "completa";
      extraModo = null;
    } else if (emp.modalidad_pago === "horas") {
      tipoJornada = "extra";
      extraModo = "horas";
    }
    // mixto: respeta lo que mandó la UI
  } else {
    // SALIDA: hereda tipo_jornada/extra_modo de la entrada abierta que cierra.
    // Mira las últimas MAX_TURNO_HORAS y empareja igual que el historial, así una
    // salida de madrugada toma la entrada del día anterior (turno que cruza la 0h).
    const desde = new Date(ahora - MAX_TURNO_HORAS * 3_600_000).toISOString();
    const { data: recientes } = await db
      .from("time_records")
      .select("*")
      .eq("employee_id", input.employee_id)
      .gte("timestamp", desde)
      .order("timestamp", { ascending: true });
    // La entrada que esta salida cerraría es la abierta más vieja del período.
    const abierta = emparejarFichajes((recientes ?? []) as TimeRecord[]).find(
      (p) => p.entrada && !p.salida,
    )?.entrada;
    if (abierta) {
      tipoJornada = abierta.tipo_jornada;
      extraModo = abierta.extra_modo;
    }
  }

  // Subir foto al bucket privado
  let fotoPath: string | null = null;
  let fotoUrl: string | null = null;
  try {
    const { buffer, ext } = dataUrlToBuffer(input.foto_base64);
    const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
    fotoPath = `${input.employee_id}/${ym}/${ahora}.${ext}`;
    const { error: upErr } = await svc.storage
      .from("fichaje-selfies")
      .upload(fotoPath, buffer, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: false,
      });
    if (upErr) throw upErr;
    // URL firmada corta para feedback inmediato (opcional)
    const { data: signed } = await svc.storage
      .from("fichaje-selfies")
      .createSignedUrl(fotoPath, 3600);
    fotoUrl = signed?.signedUrl ?? null;
  } catch {
    return NextResponse.json(
      { error: "no se pudo guardar la foto" },
      { status: 500 },
    );
  }

  // Insertar el registro
  const { error: insErr } = await db.from("time_records").insert({
    employee_id: input.employee_id,
    tipo: input.tipo,
    tipo_jornada: tipoJornada,
    extra_modo: extraModo,
    nota: input.nota ?? null,
    foto_path: fotoPath,
    foto_url: fotoUrl,
  });
  if (insErr) {
    return NextResponse.json(
      { error: "no se pudo registrar el fichaje" },
      { status: 500 },
    );
  }

  // PIN válido = sesión de empleado. Permite ver el historial propio justo
  // después de fichar, sin volver a loguearse.
  const cookieStore = await cookies();
  cookieStore.set(EMPLEADO_COOKIE, await firmarSesion(input.employee_id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true, tipo: input.tipo });
}
