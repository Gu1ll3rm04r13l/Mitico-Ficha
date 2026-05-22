import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarPin } from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Verifica el PIN ANTES de abrir la cámara, para fallar rápido si está mal.
// El fichaje real (/api/fichar) vuelve a verificar el PIN — esto es solo UX.
// Empleado sin PIN (primera vez) se maneja con /api/set-pin, no acá.

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
});

// Lockout en memoria: 5 fallos → 5 min de bloqueo por empleado.
const intentos = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const { employee_id, pin } = parsed.data;

  const db = createServiceClient().schema("fichaje");

  const { data: emp, error: empErr } = await db
    .from("employees")
    .select("id, activo, pin_hash")
    .eq("id", employee_id)
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

  // Sin PIN aún: no se valida acá (el alta la hace /api/set-pin).
  if (!emp.pin_hash) {
    return NextResponse.json({ ok: true, sinPin: true });
  }

  const estado = intentos.get(employee_id);
  if (estado && estado.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos de PIN. Probá en unos minutos." },
      { status: 429 },
    );
  }

  const ok = await verificarPin(pin, emp.pin_hash);
  if (!ok) {
    const fails = (estado?.fails ?? 0) + 1;
    intentos.set(employee_id, {
      fails,
      hasta: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
    });
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }
  intentos.delete(employee_id);

  return NextResponse.json({ ok: true });
}
