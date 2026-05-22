import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  verificarPin,
  firmarSesion,
  EMPLEADO_COOKIE,
} from "@/lib/fichaje/pin";

export const runtime = "nodejs";

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
});

// Lockout en memoria: 5 intentos fallidos → 5 min de bloqueo por empleado.
const intentos = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const { employee_id, pin } = parsed.data;

  const estado = intentos.get(employee_id);
  if (estado && estado.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá en unos minutos." },
      { status: 429 },
    );
  }

  const db = createServiceClient().schema("fichaje");
  const { data: emp } = await db
    .from("employees")
    .select("id, pin_hash, activo")
    .eq("id", employee_id)
    .maybeSingle();

  if (!emp || !emp.activo || !emp.pin_hash) {
    return NextResponse.json(
      { error: "empleado no encontrado" },
      { status: 404 },
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
  const cookieStore = await cookies();
  cookieStore.set(EMPLEADO_COOKIE, await firmarSesion(employee_id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true });
}
