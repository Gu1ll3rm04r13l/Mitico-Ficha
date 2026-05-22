import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { hashPin, pinValido } from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Alta de PIN en la primera vez, SIN necesidad de fichar.
// Solo setea el PIN si el empleado todavía no tiene uno (no permite pisar un PIN
// existente — eso requeriría autenticación). Pensado para el flujo /fichar cuando
// el empleado fue creado por el encargado sin PIN.
const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().refine(pinValido, "PIN de 4 a 8 dígitos"),
});

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
  // Si ya tiene PIN, no se pisa por acá (sería un reset sin autenticación).
  if (emp.pin_hash) {
    return NextResponse.json({ ok: true, yaTenia: true });
  }

  const { error: upErr } = await db
    .from("employees")
    .update({ pin_hash: await hashPin(pin) })
    .eq("id", employee_id);
  if (upErr) {
    return NextResponse.json(
      { error: "no se pudo guardar el PIN" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
