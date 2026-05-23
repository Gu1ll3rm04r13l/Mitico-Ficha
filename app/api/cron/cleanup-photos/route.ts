import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Rotación de fotos: borra selfies con más de 55 días, conserva el registro.
// Cada turno tiene 2 fotos (entrada/salida) con su propio momento.
const DIAS = 55;
const LOTE = 200;

type Lado = {
  col_at: "entrada_at" | "salida_at";
  col_path: "entrada_foto_path" | "salida_foto_path";
  col_url: "entrada_foto_url" | "salida_foto_url";
};

const LADOS: Lado[] = [
  { col_at: "entrada_at", col_path: "entrada_foto_path", col_url: "entrada_foto_url" },
  { col_at: "salida_at", col_path: "salida_foto_path", col_url: "salida_foto_url" },
];

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const svc = createServiceClient();
  const db = svc.schema("fichaje");
  const limite = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  let borradas = 0;

  for (const lado of LADOS) {
    const { data, error } = await db
      .from("turnos")
      .select(`id, ${lado.col_path}`)
      .lt(lado.col_at, limite)
      .not(lado.col_path, "is", null)
      .limit(LOTE);
    if (error) {
      return NextResponse.json({ error: "error de base" }, { status: 500 });
    }
    const viejos = (data ?? []) as Array<
      { id: string } & Record<string, string | null>
    >;
    if (viejos.length === 0) continue;

    const paths = viejos
      .map((r) => r[lado.col_path])
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await svc.storage.from("fichaje-selfies").remove(paths);
    }
    const ids = viejos.map((r) => r.id);
    await db
      .from("turnos")
      .update({ [lado.col_path]: null, [lado.col_url]: null })
      .in("id", ids);
    borradas += paths.length;
  }

  return NextResponse.json({ ok: true, borradas });
}
