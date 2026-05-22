import type { RolApp } from "./types";
import { RANGO_ROL } from "./types";

// Acceso al panel admin: admin, jefe y encargado. Empleado NO.
export function puedeAccederAdmin(rol: RolApp | null | undefined): boolean {
  if (!rol) return false;
  return rol === "admin" || rol === "jefe" || rol === "encargado";
}

// Gestionar sueldos / empleados / fichajes: staff (jefe/encargado/admin).
export function puedeGestionar(rol: RolApp | null | undefined): boolean {
  return puedeAccederAdmin(rol);
}

// Cambiar roles de otros: SOLO admin.
export function puedeCambiarRoles(rol: RolApp | null | undefined): boolean {
  return rol === "admin";
}

export function rangoDe(rol: RolApp): number {
  return RANGO_ROL[rol];
}
