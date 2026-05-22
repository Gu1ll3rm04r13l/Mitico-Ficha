// Seed de empleados de prueba para Mítico. Idempotente: no duplica si re-corrés.
// Uso: node scripts/seed-empleados.mjs
// Crea cada empleado con un PIN conocido (ver tabla al final) para probar /fichar y /mi-historial.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";

// Carga .env.local sin dependencias.
function loadEnv() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2].trim();
    }
  } catch {}
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || serviceKey.includes("PEGAR")) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
const db = sb.schema("fichaje");

// Plantel de prueba. PIN en claro acá solo para testeo local.
const PLANTEL = [
  { nombre: "Lucía",   apellido: "Fernández", rol: "moza",     modalidad_pago: "jornada", pin: "1111" },
  { nombre: "Marcos",  apellido: "Pereyra",   rol: "pizzero",  modalidad_pago: "mixto",   pin: "2222" },
  { nombre: "Sofía",   apellido: "Gómez",     rol: "cajera",   modalidad_pago: "jornada", pin: "3333" },
  { nombre: "Diego",   apellido: "Ramírez",   rol: "barman",   modalidad_pago: "horas",   pin: "4444" },
  { nombre: "Valentina", apellido: "Torres",  rol: "cocinera", modalidad_pago: "jornada", pin: "5555" },
];

let creados = 0;
let saltados = 0;

for (const e of PLANTEL) {
  // Evita duplicado por nombre + apellido.
  const { data: existe, error: qErr } = await db
    .from("employees")
    .select("id")
    .eq("nombre", e.nombre)
    .eq("apellido", e.apellido)
    .maybeSingle();
  if (qErr) {
    console.error(`Error consultando ${e.nombre} ${e.apellido}:`, qErr.message);
    process.exit(1);
  }
  if (existe) {
    console.log(`• ya existe, salto: ${e.nombre} ${e.apellido}`);
    saltados++;
    continue;
  }

  const pin_hash = await bcrypt.hash(e.pin, 10);
  const { error: iErr } = await db.from("employees").insert({
    nombre: e.nombre,
    apellido: e.apellido,
    rol: e.rol,
    modalidad_pago: e.modalidad_pago,
    pin_hash,
    activo: true,
  });
  if (iErr) {
    console.error(`Error creando ${e.nombre} ${e.apellido}:`, iErr.message);
    process.exit(1);
  }
  console.log(`✓ creado: ${e.nombre} ${e.apellido} (${e.rol})`);
  creados++;
}

console.log(`\nListo. Creados: ${creados} · Saltados (ya existían): ${saltados}`);
console.log("\nPINs de prueba para fichar:");
for (const e of PLANTEL) {
  console.log(`  ${e.nombre} ${e.apellido} — PIN ${e.pin} (${e.rol}, ${e.modalidad_pago})`);
}
