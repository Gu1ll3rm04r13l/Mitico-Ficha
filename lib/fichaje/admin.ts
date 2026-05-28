import "server-only";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type {
  Employee,
  SalaryHistory,
  ExtraFracciones,
  RolApp,
  Turno,
} from "./types";
import { DEFAULT_EXTRA_FRACCIONES } from "./types";
import { rangoMes } from "./historial";
import { calcularPeriodo } from "./sueldo";

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

export interface FichadoAhora {
  employeeId: string;
  nombre: string;
  entradaAt: string;
}

export interface DashboardResumen {
  empleadosActivos: number;
  totalPagarMes: number; // estimado del mes (base + extras)
  fichadosAhora: FichadoAhora[]; // turnos abiertos (entrada sin salida)
}

// Datos del INICIO del panel: empleados activos, quién está fichado ahora y
// el total estimado a pagar del mes en curso (suma de todos los empleados).
export async function getDashboardResumen(
  mes: string,
): Promise<DashboardResumen> {
  const sb = await db();
  const { desde, hasta } = rangoMes(mes);
  const fracciones = await getFraccionesExtra();

  const [empRes, turnosRes, histRes, abiertosRes] = await Promise.all([
    sb.from("employees").select("id, nombre, apellido, activo"),
    sb
      .from("turnos")
      .select("*")
      .gte("entrada_at", desde)
      .lt("entrada_at", hasta),
    sb.from("salary_history").select("*"),
    sb
      .from("turnos")
      .select("id, employee_id, entrada_at")
      .is("salida_at", null)
      .order("entrada_at", { ascending: true }),
  ]);

  const empleados = (empRes.data ?? []) as Pick<
    Employee,
    "id" | "nombre" | "apellido" | "activo"
  >[];
  const empById = new Map(empleados.map((e) => [e.id, e]));
  const empleadosActivos = empleados.filter((e) => e.activo).length;

  // Total a pagar: agrupo turnos del mes por empleado y corro el cálculo real.
  const turnos = (turnosRes.data ?? []) as Turno[];
  const hist = (histRes.data ?? []) as SalaryHistory[];
  const histByEmp = new Map<string, SalaryHistory[]>();
  for (const h of hist) {
    const arr = histByEmp.get(h.employee_id) ?? [];
    arr.push(h);
    histByEmp.set(h.employee_id, arr);
  }
  const turnosByEmp = new Map<string, Turno[]>();
  for (const t of turnos) {
    const arr = turnosByEmp.get(t.employee_id) ?? [];
    arr.push(t);
    turnosByEmp.set(t.employee_id, arr);
  }
  let totalPagarMes = 0;
  for (const [empId, ts] of turnosByEmp) {
    const r = calcularPeriodo(ts, histByEmp.get(empId) ?? [], {
      incluirExtras: true,
      fracciones,
    });
    totalPagarMes += r.total;
  }

  const fichadosAhora: FichadoAhora[] = (abiertosRes.data ?? []).map((a) => {
    const e = empById.get(a.employee_id);
    return {
      employeeId: a.employee_id,
      nombre: e ? `${e.nombre}${e.apellido ? " " + e.apellido : ""}` : "—",
      entradaAt: a.entrada_at,
    };
  });

  return { empleadosActivos, totalPagarMes, fichadosAhora };
}

export interface FilaResumenPago {
  employeeId: string;
  nombre: string;
  apellido: string | null;
  rol: string | null;
  diasCompletos: number;
  cantidadExtras: number;
  totalBase: number;
  totalExtras: number;
  total: number;
}

export interface ResumenPagosMes {
  filas: FilaResumenPago[];
  totalGeneral: number;
}

// Tabla de "cuánto se le paga a cada empleado" en un mes: una fila por empleado
// con días completos, extras y total. Reusa el mismo cálculo que la liquidación.
export async function getResumenPagosMes(
  mes: string,
): Promise<ResumenPagosMes> {
  const sb = await db();
  const { desde, hasta } = rangoMes(mes);
  const fracciones = await getFraccionesExtra();

  const [empRes, turnosRes, histRes] = await Promise.all([
    sb.from("employees").select("id, nombre, apellido, rol, activo"),
    sb.from("turnos").select("*").gte("entrada_at", desde).lt("entrada_at", hasta),
    sb.from("salary_history").select("*"),
  ]);

  const empleados = (empRes.data ?? []) as Pick<
    Employee,
    "id" | "nombre" | "apellido" | "rol" | "activo"
  >[];
  const turnos = (turnosRes.data ?? []) as Turno[];
  const hist = (histRes.data ?? []) as SalaryHistory[];

  const histByEmp = new Map<string, SalaryHistory[]>();
  for (const h of hist) {
    const arr = histByEmp.get(h.employee_id) ?? [];
    arr.push(h);
    histByEmp.set(h.employee_id, arr);
  }
  const turnosByEmp = new Map<string, Turno[]>();
  for (const t of turnos) {
    const arr = turnosByEmp.get(t.employee_id) ?? [];
    arr.push(t);
    turnosByEmp.set(t.employee_id, arr);
  }

  const filas: FilaResumenPago[] = [];
  let totalGeneral = 0;
  for (const e of empleados) {
    const ts = turnosByEmp.get(e.id) ?? [];
    const r = calcularPeriodo(ts, histByEmp.get(e.id) ?? [], {
      incluirExtras: true,
      fracciones,
    });
    filas.push({
      employeeId: e.id,
      nombre: e.nombre,
      apellido: e.apellido,
      rol: e.rol,
      diasCompletos: r.diasCompletos,
      cantidadExtras: r.cantidadExtras,
      totalBase: r.totalBase,
      totalExtras: r.totalExtras,
      total: r.total,
    });
    totalGeneral += r.total;
  }
  // Mayor pago primero; empleados sin turnos al final.
  filas.sort((a, b) => b.total - a.total);

  return { filas, totalGeneral };
}
