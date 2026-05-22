import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarPin, firmarSesion, EMPLEADO_COOKIE } from "@/lib/fichaje/pin";
import { getTurnosMes, mesActual } from "@/lib/fichaje/historial";
import type { Turno } from "@/lib/fichaje/types";

export const runtime = "nodejs";

// Lista los turnos del mes del empleado para la tabla post-PIN. Verifica PIN y
// re-firma las fotos (las URLs guardadas vencen a la hora). PIN válido = sesión
// de empleado (para que "Ver mi historial" funcione aunque todavía no fiche).

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const { employee_id, pin, mes } = parsed.data;

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: emp } = await db
    .from("employees")
    .select("id, activo, pin_hash")
    .eq("id", employee_id)
    .maybeSingle();
  if (!emp || !emp.activo || !emp.pin_hash) {
    return NextResponse.json({ error: "empleado inválido" }, { status: 404 });
  }
  const ok = await verificarPin(pin, emp.pin_hash);
  if (!ok) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });

  const cookieStore = await cookies();
  cookieStore.set(EMPLEADO_COOKIE, await firmarSesion(employee_id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  const turnos = await getTurnosMes(employee_id, mes ?? mesActual());

  const paths = turnos
    .flatMap((t) => [t.entrada_foto_path, t.salida_foto_path])
    .filter((p): p is string => !!p);
  const firmadas = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await svc.storage
      .from("fichaje-selfies")
      .createSignedUrls(paths, 3600);
    data?.forEach((d) => {
      if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
    });
  }
  const conUrls: Turno[] = turnos.map((t) => ({
    ...t,
    entrada_foto_url: t.entrada_foto_path
      ? (firmadas.get(t.entrada_foto_path) ?? null)
      : null,
    salida_foto_url: t.salida_foto_path
      ? (firmadas.get(t.salida_foto_path) ?? null)
      : null,
  }));

  return NextResponse.json({ ok: true, turnos: conUrls });
}
