import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { emparejarFichajes, type ParFichaje } from "./sueldo";
import type { TimeRecord } from "./types";

// Rango [desde, hasta) de un mes YYYY-MM.
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const desde = new Date(Date.UTC(y, m - 1, 1));
  const hasta = new Date(Date.UTC(y, m, 1));
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

// Fichajes de un empleado en un mes. Usado por /mi-historial y el panel admin.
export async function getFichajesMes(
  employeeId: string,
  mes: string,
): Promise<TimeRecord[]> {
  const { desde, hasta } = rangoMes(mes);
  const { data, error } = await createServiceClient()
    .schema("fichaje")
    .from("time_records")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("timestamp", desde)
    .lt("timestamp", hasta)
    .order("timestamp", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Pares entrada→salida de un mes, emparejando con un margen de ±1 día para no
// partir turnos que cruzan la medianoche en el borde del mes (ej.: entra el 31 a
// las 23:00 y sale el 1 a las 00:30). Cada par se ancla al día de su entrada
// (o salida si es huérfana) y se queda solo si ese ancla cae dentro del mes.
export async function getParesMes(
  employeeId: string,
  mes: string,
): Promise<ParFichaje[]> {
  const { desde, hasta } = rangoMes(mes);
  const desdeBuf = new Date(new Date(desde).getTime() - 86_400_000).toISOString();
  const hastaBuf = new Date(new Date(hasta).getTime() + 86_400_000).toISOString();

  const { data, error } = await createServiceClient()
    .schema("fichaje")
    .from("time_records")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("timestamp", desdeBuf)
    .lt("timestamp", hastaBuf)
    .order("timestamp", { ascending: true });
  if (error) throw error;

  const pares = emparejarFichajes(data ?? []);
  // fechaISO ya está anclado al día (en hora AR) de la entrada (o salida si es
  // huérfana). El par pertenece al mes si ese día cae dentro de él.
  return pares.filter((p) => p.fechaISO.slice(0, 7) === mes);
}

export function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}
