// Sesión firmada del empleado (cookie httpOnly). Edge-safe: usa Web Crypto,
// sin node:crypto, para poder verificar la sesión en el middleware (Edge runtime).

const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 horas
export const EMPLEADO_COOKIE = "mitico_emp";

interface SesionEmpleado {
  employeeId: string;
  exp: number;
}

function secret(): string {
  const s = process.env.EMPLEADO_SESSION_SECRET;
  if (!s) throw new Error("EMPLEADO_SESSION_SECRET no configurado");
  return s;
}

const enc = new TextEncoder();

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToB64url(str: string): string {
  return bytesToB64url(enc.encode(str));
}

function b64urlToStr(b64: string): string {
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

export async function firmarSesion(employeeId: string): Promise<string> {
  const payload: SesionEmpleado = {
    employeeId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const json = strToB64url(JSON.stringify(payload));
  const firma = await hmac(json);
  return `${json}.${firma}`;
}

export async function verificarSesion(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [json, firma] = parts as [string, string];

  const esperada = await hmac(json);
  // Comparación de longitud + contenido (firmas son base64url ASCII).
  if (firma.length !== esperada.length) return null;
  let diff = 0;
  for (let i = 0; i < firma.length; i++) {
    diff |= firma.charCodeAt(i) ^ esperada.charCodeAt(i);
  }
  if (diff !== 0) return null;

  try {
    const payload = JSON.parse(b64urlToStr(json)) as SesionEmpleado;
    if (payload.exp < Date.now()) return null;
    return payload.employeeId;
  } catch {
    return null;
  }
}
