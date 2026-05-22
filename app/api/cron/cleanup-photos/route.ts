import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Rotación de fotos: borra selfies con más de 55 días, conserva el registro.
// Disparado por Vercel Cron (ver vercel.json) o manualmente con el header secreto.
const DIAS = 55;
const LOTE = 200;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const svc = createServiceClient();
  const db = svc.schema("fichaje");
  const limite = new Date(Date.now() - DIAS * 86_400_000).toISOString();

  const { data: viejos, error } = await db
    .from("time_records")
    .select("id, foto_path")
    .lt("timestamp", limite)
    .not("foto_path", "is", null)
    .limit(LOTE);

  if (error) {
    return NextResponse.json({ error: "error de base" }, { status: 500 });
  }
  if (!viejos || viejos.length === 0) {
    return NextResponse.json({ ok: true, borradas: 0 });
  }

  const paths = viejos
    .map((r) => r.foto_path)
    .filter((p): p is string => !!p);

  // Borra de Storage
  if (paths.length > 0) {
    await svc.storage.from("fichaje-selfies").remove(paths);
  }

  // Limpia las referencias (conserva el registro del fichaje)
  const ids = viejos.map((r) => r.id);
  await db
    .from("time_records")
    .update({ foto_path: null, foto_url: null })
    .in("id", ids);

  return NextResponse.json({ ok: true, borradas: paths.length });
}
