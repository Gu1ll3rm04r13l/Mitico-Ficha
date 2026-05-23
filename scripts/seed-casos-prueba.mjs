// Casos de prueba de turnos para testear historial y liquidación (modelo
// turno-fila). Cubre: turno normal, cruce de medianoche, doble jornada, turno
// abierto, extra por horas, fichaje con hora a mano (manual).
//
// Uso: node scripts/seed-casos-prueba.mjs
// Idempotente: borra primero los turnos marcados con "[PRUEBA]" en la nota.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

const EMPLEADO = { nombre: "Lucía", apellido: "Fernández" };
const TZ = "-03:00";
function ts(fechaHora) {
  return `${fechaHora}:00${TZ}`; // "2026-05-15T09:00" -> ISO ART
}

const NOTA = "[PRUEBA]";
const Y = "2026";
const M = "05";

// Cada caso es un turno (entrada + salida opcional).
const CASOS = [
  {
    titulo: "Turno normal mismo día (09:00 → 17:00 = 8h)",
    entrada_at: `${Y}-${M}-04T09:00`,
    salida_at: `${Y}-${M}-04T17:00`,
  },
  {
    titulo: "Cruza medianoche (Mié 18:00 → Jue 00:30 = 6.5h)",
    entrada_at: `${Y}-${M}-06T18:00`,
    salida_at: `${Y}-${M}-07T00:30`,
  },
  {
    titulo: "Turno abierto: solo entrada (Sáb 10:00, sin salida)",
    entrada_at: `${Y}-${M}-09T10:00`,
    salida_at: null,
  },
  {
    titulo: "Extra por horas (Lun 18:00 → 22:00 = 4h)",
    entrada_at: `${Y}-${M}-11T18:00`,
    salida_at: `${Y}-${M}-11T22:00`,
    tipo_jornada: "extra",
    extra_modo: "horas",
  },
  {
    titulo: "Fichaje con hora a mano (entrada y salida manual) → badge ⏱",
    entrada_at: `${Y}-${M}-14T08:00`,
    salida_at: `${Y}-${M}-14T16:00`,
    entrada_manual: true,
    salida_manual: true,
  },
];

const { data: emp, error: empErr } = await db
  .from("employees")
  .select("id, nombre, apellido")
  .eq("nombre", EMPLEADO.nombre)
  .eq("apellido", EMPLEADO.apellido)
  .maybeSingle();
if (empErr) {
  console.error("Error buscando empleado:", empErr.message);
  process.exit(1);
}
if (!emp) {
  console.error(
    `No existe ${EMPLEADO.nombre} ${EMPLEADO.apellido}. Corré primero: node scripts/seed-empleados.mjs`,
  );
  process.exit(1);
}

const { error: delErr } = await db
  .from("turnos")
  .delete()
  .eq("employee_id", emp.id)
  .eq("nota", NOTA);
if (delErr) {
  console.error("Error borrando pruebas previas:", delErr.message);
  process.exit(1);
}

const filas = CASOS.map((c) => ({
  employee_id: emp.id,
  tipo_jornada: c.tipo_jornada ?? "completa",
  extra_modo: c.extra_modo ?? null,
  nota: NOTA,
  entrada_at: ts(c.entrada_at),
  entrada_manual: c.entrada_manual ?? false,
  salida_at: c.salida_at ? ts(c.salida_at) : null,
  salida_manual: c.salida_manual ?? false,
}));

const { error: insErr } = await db.from("turnos").insert(filas);
if (insErr) {
  console.error("Error insertando casos:", insErr.message);
  process.exit(1);
}

console.log(`✓ ${filas.length} turnos insertados para ${emp.nombre} ${emp.apellido}.\n`);
console.log("Casos cargados:");
for (const c of CASOS) console.log(`  • ${c.titulo}`);
console.log(`\nAbrí /mi-historial (logueado como ${emp.nombre}) o el panel admin del empleado.`);
console.log("Para limpiar: volvé a correr este script (borra los [PRUEBA] antes de insertar).");
