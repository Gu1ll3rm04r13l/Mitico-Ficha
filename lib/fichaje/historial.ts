import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Turno } from "./types";

// Rango [desde, hasta) de un mes YYYY-MM.
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const desde = new Date(Date.UTC(y, m - 1, 1));
  const hasta = new Date(Date.UTC(y, m, 1));
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

// Turnos de un empleado en un mes (anclados por entrada_at). Sin buffer ±1 día:
// con turno-fila el cruce de medianoche vive en una sola fila.
export async function getTurnosMes(
  employeeId: string,
  mes: string,
): Promise<Turno[]> {
  const { desde, hasta } = rangoMes(mes);
  const { data, error } = await createServiceClient()
    .schema("fichaje")
    .from("turnos")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("entrada_at", desde)
    .lt("entrada_at", hasta)
    .order("entrada_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}
