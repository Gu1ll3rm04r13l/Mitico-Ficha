import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Employee, TimeRecord } from "./types";

const f = () => createServiceClient().schema("fichaje");

// Empleados activos para la grilla pública de fichaje (sin datos sensibles).
export async function getEmpleadosActivos(): Promise<
  Pick<Employee, "id" | "nombre" | "apellido" | "rol" | "modalidad_pago" | "foto_perfil_url">[]
> {
  const { data, error } = await f()
    .from("employees")
    .select("id, nombre, apellido, rol, modalidad_pago, foto_perfil_url")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEmpleado(id: string): Promise<Employee | null> {
  const { data, error } = await f()
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Último fichaje del empleado en el día (para sugerir entrada/salida).
export async function getUltimoFichajeHoy(
  employeeId: string,
): Promise<TimeRecord | null> {
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const { data, error } = await f()
    .from("time_records")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("timestamp", inicioDia.toISOString())
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
