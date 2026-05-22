import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarPin } from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Cierra un turno abierto (setea la salida). Verifica PIN del dueño del turno.

const schema = z.object({
  pin: z.string().min(4).max(8),
  at: z.string().datetime(),
  manual: z.boolean().default(false),
  foto_base64: z.string().min(100),
});

// NOTE: lockout en memoria, se resetea en cold start (serverless). Tradeoff aceptado para este kiosko.
const intentosPin = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) throw new Error("formato de imagen inválido");
  const ext = m[1] === "png" ? "png" : "jpg";
  return { buffer: Buffer.from(m[2]!, "base64"), ext };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: turno, error: tErr } = await db
    .from("turnos")
    .select("id, employee_id, entrada_at, salida_at")
    .eq("id", id)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: "error de base" }, { status: 500 });
  if (!turno) return NextResponse.json({ error: "turno inexistente" }, { status: 404 });
  if (turno.salida_at != null) {
    return NextResponse.json({ error: "ese turno ya tiene salida" }, { status: 409 });
  }

  const { data: emp } = await db
    .from("employees")
    .select("id, activo, pin_hash")
    .eq("id", turno.employee_id)
    .maybeSingle();
  if (!emp || !emp.activo) {
    return NextResponse.json({ error: "empleado inactivo" }, { status: 404 });
  }
  if (!emp.pin_hash) {
    return NextResponse.json({ error: "el empleado no tiene PIN" }, { status: 400 });
  }

  const estadoPin = intentosPin.get(emp.id);
  if (estadoPin && estadoPin.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos de PIN. Probá en unos minutos." },
      { status: 429 },
    );
  }
  const ok = await verificarPin(input.pin, emp.pin_hash);
  if (!ok) {
    const fails = (estadoPin?.fails ?? 0) + 1;
    intentosPin.set(emp.id, {
      fails,
      hasta: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
    });
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }
  intentosPin.delete(emp.id);

  const cuando = new Date(input.at);
  if (cuando.getTime() > Date.now() + 2 * 60_000) {
    return NextResponse.json({ error: "No podés fichar en el futuro." }, { status: 400 });
  }
  if (cuando.getTime() < new Date(turno.entrada_at).getTime()) {
    return NextResponse.json(
      { error: "La salida tiene que ser posterior a la entrada." },
      { status: 400 },
    );
  }

  let fotoPath: string | null = null;
  let fotoUrl: string | null = null;
  try {
    const { buffer, ext } = dataUrlToBuffer(input.foto_base64);
    const ym = input.at.slice(0, 7);
    fotoPath = `${emp.id}/${ym}/${Date.now()}-salida.${ext}`;
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

  const { data: upd, error: upErr } = await db
    .from("turnos")
    .update({
      salida_at: cuando.toISOString(),
      salida_foto_path: fotoPath,
      salida_foto_url: fotoUrl,
      salida_manual: input.manual,
    })
    .eq("id", id)
    .is("salida_at", null)
    .select("id");
  if (upErr) {
    return NextResponse.json({ error: "no se pudo registrar la salida" }, { status: 500 });
  }
  if (!upd || upd.length === 0) {
    return NextResponse.json({ error: "ese turno ya fue cerrado" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
