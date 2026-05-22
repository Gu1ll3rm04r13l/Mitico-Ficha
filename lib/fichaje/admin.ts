import "server-only";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  Employee,
  SalaryHistory,
  ExtraFracciones,
  RolApp,
} from "./types";
import { DEFAULT_EXTRA_FRACCIONES } from "./types";

const db = async () => (await createClient()).schema("fichaje");

export async function listarEmpleados(): Promise<Employee[]> {
  const { data, error } = await (await db())
    .from("employees")
    .select("*")
    .order("activo", { ascending: false })
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEmpleadoAdmin(id: string): Promise<Employee | null> {
  const { data, error } = await (await db())
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSalaryHistory(
  employeeId: string,
): Promise<SalaryHistory[]> {
  const { data, error } = await (await db())
    .from("salary_history")
    .select("*")
    .eq("employee_id", employeeId)
    .order("vigente_desde", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getFraccionesExtra(): Promise<ExtraFracciones> {
  const { data } = await (await db())
    .from("app_config")
    .select("value")
    .eq("key", "extra_fracciones")
    .maybeSingle();
  const v = data?.value as Partial<ExtraFracciones> | undefined;
  return {
    cuarto: v?.cuarto ?? DEFAULT_EXTRA_FRACCIONES.cuarto,
    medio: v?.medio ?? DEFAULT_EXTRA_FRACCIONES.medio,
    completo: v?.completo ?? DEFAULT_EXTRA_FRACCIONES.completo,
  };
}

export interface CuentaStaff {
  user_id: string;
  rol: RolApp;
  employee_id: string | null;
}

export async function listarCuentas(): Promise<CuentaStaff[]> {
  const { data, error } = await (await db())
    .from("app_users")
    .select("user_id, rol, employee_id");
  if (error) throw error;
  return data ?? [];
}

export interface CuentaDetalle {
  user_id: string;
  rol: RolApp;
  employee_id: string | null;
  email: string | null;
  empleadoNombre: string | null;
}

// Combina app_users + email (auth admin) + nombre del empleado vinculado.
export async function listarCuentasDetalle(): Promise<CuentaDetalle[]> {
  const cuentas = await listarCuentas();
  const empleados = await listarEmpleados();
  const empById = new Map(empleados.map((e) => [e.id, e]));

  const svc = createServiceClient();
  const { data: authData } = await svc.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? null]),
  );

  return cuentas.map((c) => ({
    user_id: c.user_id,
    rol: c.rol,
    employee_id: c.employee_id,
    email: emailById.get(c.user_id) ?? null,
    empleadoNombre: c.employee_id
      ? (empById.get(c.employee_id)?.nombre ?? null)
      : null,
  }));
}

// KPIs simples del mes en curso para el dashboard.
export async function getKpisMes(mes: string): Promise<{
  totalFichajes: number;
  empleadosActivos: number;
}> {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const desde = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const hasta = new Date(Date.UTC(y, m, 1)).toISOString();
  const sb = await db();

  const [{ count: fichajes }, { count: activos }] = await Promise.all([
    sb
      .from("time_records")
      .select("id", { count: "exact", head: true })
      .gte("timestamp", desde)
      .lt("timestamp", hasta),
    sb
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("activo", true),
  ]);

  return {
    totalFichajes: fichajes ?? 0,
    empleadosActivos: activos ?? 0,
  };
}
