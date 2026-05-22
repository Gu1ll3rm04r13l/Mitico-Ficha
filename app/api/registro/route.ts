import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  hashPin,
  pinValido,
  firmarSesion,
  EMPLEADO_COOKIE,
} from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Auto-registro de empleado: nombre + PIN. Nace como `empleado`, sin sueldo.
const schema = z.object({
  nombre: z.string().min(2).max(60),
  apellido: z.string().max(60).optional().nullable(),
  pin: z.string().refine(pinValido, "PIN de 4 a 8 dígitos"),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "datos inválidos", detalle: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { nombre, apellido, pin } = parsed.data;

  const db = createServiceClient().schema("fichaje");
  const pin_hash = await hashPin(pin);

  const { data, error } = await db
    .from("employees")
    .insert({
      nombre: nombre.trim(),
      apellido: apellido?.trim() || null,
      pin_hash,
      modalidad_pago: "jornada",
      activo: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "no se pudo crear el usuario" },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(EMPLEADO_COOKIE, await firmarSesion(data.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true, employee_id: data.id });
}
