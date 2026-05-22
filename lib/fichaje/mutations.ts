"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStaffSession } from "./auth";
import { hashPin, pinValido } from "./pin";
import type { ModalidadPago, RolApp } from "./types";

// Todas las mutations validan rol staff/admin server-side antes de tocar datos.

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireStaff() {
  const s = await getStaffSession();
  if (!s) throw new Error("no autorizado");
  return s;
}

// ---------- Crear empleado (staff) ----------
export async function crearEmpleado(formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const apellido = String(formData.get("apellido") ?? "").trim() || null;
  const rol = String(formData.get("rol") ?? "").trim() || null;
  const modalidad = String(formData.get("modalidad") ?? "jornada") as ModalidadPago;
  const pin = String(formData.get("pin") ?? "").trim();

  if (nombre.length < 2) return { ok: false, error: "Nombre inválido" };
  if (pin && !pinValido(pin)) return { ok: false, error: "PIN de 4 a 8 dígitos" };

  const db = createServiceClient().schema("fichaje");
  const { error } = await db.from("employees").insert({
    nombre,
    apellido,
    rol,
    modalidad_pago: modalidad,
    pin_hash: pin ? await hashPin(pin) : null,
    activo: true,
  });
  if (error) return { ok: false, error: "No se pudo crear" };
  revalidatePath("/admin/empleados");
  return { ok: true };
}

// ---------- Editar datos básicos del empleado (staff) ----------
export async function editarEmpleado(
  employeeId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const apellido = String(formData.get("apellido") ?? "").trim() || null;
  const rol = String(formData.get("rol") ?? "").trim() || null;
  if (nombre.length < 2) return { ok: false, error: "Nombre inválido" };

  const db = createServiceClient().schema("fichaje");
  const { error } = await db
    .from("employees")
    .update({ nombre, apellido, rol })
    .eq("id", employeeId);
  if (error) return { ok: false, error: "No se pudo guardar" };
  revalidatePath(`/admin/empleados/${employeeId}`);
  revalidatePath("/admin/empleados");
  return { ok: true };
}

// ---------- Eliminar empleado (staff) — borra fotos del Storage + cascade de registros ----------
export async function eliminarEmpleado(
  employeeId: string,
): Promise<ActionResult> {
  await requireStaff();
  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  // 1) Juntar paths de selfies para limpiarlas del bucket (el cascade no toca Storage).
  const { data: registros } = await db
    .from("time_records")
    .select("foto_path")
    .eq("employee_id", employeeId);
  const paths = (registros ?? [])
    .map((r) => r.foto_path)
    .filter((p): p is string => !!p);
  if (paths.length > 0) {
    await svc.storage.from("fichaje-selfies").remove(paths);
  }

  // 2) Borrar empleado. FK on delete cascade limpia time_records + salary_history.
  const { error } = await db.from("employees").delete().eq("id", employeeId);
  if (error) return { ok: false, error: "No se pudo eliminar" };
  revalidatePath("/admin/empleados");
  return { ok: true };
}

// ---------- Eliminar un fichaje individual (staff) — para corregir mal cargados ----------
export async function eliminarFichaje(
  recordId: string,
): Promise<ActionResult> {
  await requireStaff();
  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: rec } = await db
    .from("time_records")
    .select("foto_path, employee_id")
    .eq("id", recordId)
    .maybeSingle();
  if (rec?.foto_path) {
    await svc.storage.from("fichaje-selfies").remove([rec.foto_path]);
  }

  const { error } = await db.from("time_records").delete().eq("id", recordId);
  if (error) return { ok: false, error: "No se pudo borrar el fichaje" };
  if (rec?.employee_id) revalidatePath(`/admin/empleados/${rec.employee_id}`);
  return { ok: true };
}

// ---------- Guardar config de sueldo/modalidad (registra en salary_history) ----------
export async function guardarConfigSueldo(
  employeeId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireStaff();
  const modalidad = String(formData.get("modalidad") ?? "jornada") as ModalidadPago;
  const sueldoMensual = parseNum(formData.get("sueldo_mensual"));
  const diarioOverride = parseNum(formData.get("sueldo_diario_override"));
  const horaOverride = parseNum(formData.get("tarifa_hora_override"));
  const horasJornada = parseNum(formData.get("horas_jornada_estandar")) ?? 8;

  const supabase = await createClient();
  const db = supabase.schema("fichaje");

  // Actualiza el empleado (valores vigentes)
  const { error: upErr } = await db
    .from("employees")
    .update({
      modalidad_pago: modalidad,
      sueldo_mensual: sueldoMensual,
      sueldo_diario_override: diarioOverride,
      tarifa_hora_override: horaOverride,
      horas_jornada_estandar: horasJornada,
    })
    .eq("id", employeeId);
  if (upErr) return { ok: false, error: "No se pudo guardar" };

  // Inserta fila en salary_history con vigencia desde hoy
  const hoy = new Date().toISOString().slice(0, 10);
  const { error: histErr } = await db.from("salary_history").insert({
    employee_id: employeeId,
    sueldo_mensual: sueldoMensual,
    sueldo_diario_override: diarioOverride,
    tarifa_hora_override: horaOverride,
    horas_jornada_estandar: horasJornada,
    vigente_desde: hoy,
  });
  if (histErr) return { ok: false, error: "No se pudo registrar el historial" };

  revalidatePath(`/admin/empleados/${employeeId}`);
  return { ok: true };
}

// ---------- Activar / desactivar empleado ----------
export async function setEmpleadoActivo(
  employeeId: string,
  activo: boolean,
): Promise<ActionResult> {
  await requireStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .schema("fichaje")
    .from("employees")
    .update({ activo })
    .eq("id", employeeId);
  if (error) return { ok: false, error: "No se pudo actualizar" };
  revalidatePath("/admin/empleados");
  return { ok: true };
}

// ---------- Cambiar rol (SOLO admin) ----------
export async function cambiarRol(
  targetUserId: string,
  nuevoRol: RolApp,
): Promise<ActionResult> {
  const s = await requireStaff();
  if (s.rol !== "admin") return { ok: false, error: "Solo el admin cambia roles" };

  const supabase = await createClient();
  // La RLS también lo exige (appusers_admin_update), doble candado.
  const { error } = await supabase
    .schema("fichaje")
    .from("app_users")
    .update({ rol: nuevoRol })
    .eq("user_id", targetUserId);
  if (error) return { ok: false, error: "No se pudo cambiar el rol" };
  revalidatePath("/admin/cuentas");
  return { ok: true };
}

// ---------- Crear cuenta staff (SOLO admin) ----------
export async function crearCuentaStaff(
  formData: FormData,
): Promise<ActionResult> {
  const s = await requireStaff();
  if (s.rol !== "admin") return { ok: false, error: "Solo el admin crea cuentas" };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rol = String(formData.get("rol") ?? "encargado") as RolApp;
  const employeeId = String(formData.get("employee_id") ?? "").trim() || null;

  if (!email || password.length < 6) {
    return { ok: false, error: "Email válido y contraseña de 6+ caracteres" };
  }
  if (rol === "empleado") {
    return { ok: false, error: "Para empleado usá el alta normal" };
  }

  const svc = createServiceClient();
  // Crea el usuario Auth ya confirmado.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message ?? "No se pudo crear la cuenta" };
  }

  const { error: auErr } = await svc.schema("fichaje").from("app_users").insert({
    user_id: created.user.id,
    rol,
    employee_id: employeeId,
  });
  if (auErr) return { ok: false, error: "Cuenta creada pero falló asignar rol" };

  revalidatePath("/admin/cuentas");
  return { ok: true };
}

// ---------- Guardar fracciones EXTRA (config global, solo admin) ----------
export async function guardarFraccionesExtra(
  cuarto: number,
  medio: number,
  completo: number,
): Promise<ActionResult> {
  const s = await requireStaff();
  if (s.rol !== "admin") return { ok: false, error: "Solo el admin edita esto" };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("fichaje")
    .from("app_config")
    .update({
      value: { cuarto, medio, completo },
      updated_at: new Date().toISOString(),
    })
    .eq("key", "extra_fracciones");
  if (error) return { ok: false, error: "No se pudo guardar" };
  revalidatePath("/admin");
  return { ok: true };
}

function parseNum(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
