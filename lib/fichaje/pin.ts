import bcrypt from "bcryptjs";

// Hash / verificación de PIN (bcrypt). Solo runtime node (route handlers).
const PIN_REGEX = /^\d{4,8}$/;

export function pinValido(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// Re-export de la sesión para mantener imports existentes.
export { firmarSesion, verificarSesion, EMPLEADO_COOKIE } from "./session";
