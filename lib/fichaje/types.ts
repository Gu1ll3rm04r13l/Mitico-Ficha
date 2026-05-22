// Tipos de dominio del fichaje. Espejo del schema `fichaje` en Supabase.

export type ModalidadPago = "jornada" | "horas" | "mixto";
export type TipoJornada = "completa" | "extra";
export type ExtraModo = "cuarto" | "medio" | "completo" | "horas";
export type RolApp = "admin" | "jefe" | "encargado" | "empleado";

export interface Employee {
  id: string;
  nombre: string;
  apellido: string | null;
  rol: string | null;
  modalidad_pago: ModalidadPago;
  sueldo_mensual: number | null;
  sueldo_diario_override: number | null;
  tarifa_hora_override: number | null;
  horas_jornada_estandar: number;
  pin_hash: string | null;
  activo: boolean;
  user_id: string | null;
  foto_perfil_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryHistory {
  id: string;
  employee_id: string;
  sueldo_mensual: number | null;
  sueldo_diario_override: number | null;
  tarifa_hora_override: number | null;
  horas_jornada_estandar: number;
  vigente_desde: string; // YYYY-MM-DD
  created_at: string;
}

export interface Turno {
  id: string;
  employee_id: string;
  tipo_jornada: TipoJornada;
  extra_modo: ExtraModo | null;
  nota: string | null;
  entrada_at: string;
  entrada_foto_url: string | null;
  entrada_foto_path: string | null;
  entrada_manual: boolean;
  salida_at: string | null;
  salida_foto_url: string | null;
  salida_foto_path: string | null;
  salida_manual: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  user_id: string;
  rol: RolApp;
  employee_id: string | null;
  created_at: string;
}

export interface ExtraFracciones {
  cuarto: number;
  medio: number;
  completo: number;
}

export const DEFAULT_EXTRA_FRACCIONES: ExtraFracciones = {
  cuarto: 0.25,
  medio: 0.5,
  completo: 1.0,
};

// Jerarquía de roles para chequeos de permiso (mayor = más poder).
export const RANGO_ROL: Record<RolApp, number> = {
  empleado: 0,
  encargado: 2,
  jefe: 2,
  admin: 3,
};
