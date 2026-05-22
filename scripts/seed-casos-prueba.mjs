// Casos de prueba de fichajes para testear el historial y el emparejado.
// Cubre: turno normal, turno que cruza la medianoche, cruce en el borde del mes,
// doble jornada, turno abierto (sin salida) y salida huérfana (sin entrada).
//
// Uso: node scripts/seed-casos-prueba.mjs
// Idempotente: borra primero los fichajes marcados con "[PRUEBA]" en la nota.
// Apunta a Lucía Fernández (modalidad jornada) por defecto.
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
// Mes objetivo: el actual (los timestamps usan offset ART -03:00).
const TZ = "-03:00";
function ts(fechaHora) {
  return `${fechaHora}:00${TZ}`; // "2026-05-15T09:00" -> ISO ART
}

// ----- Casos. Cada uno arma 0/1/2 registros. -----
// nota lleva "[PRUEBA]" para poder borrarlos y re-correr.
const NOTA = "[PRUEBA]";

// AJUSTÁ el mes/año si hoy no es mayo 2026.
const Y = "2026";
const M = "05";

const CASOS = [
  {
    titulo: "Turno normal mismo día (09:00 → 17:00 = 8h)",
    registros: [
      { tipo: "entrada", t: `${Y}-${M}-04T09:00`, tipo_jornada: "completa" },
      { tipo: "salida", t: `${Y}-${M}-04T17:00`, tipo_jornada: "completa" },
    ],
  },
  {
    titulo: "Cruza medianoche (Mié 18:00 → Jue 00:30 = 6.5h) → badge +1 día",
    registros: [
      { tipo: "entrada", t: `${Y}-${M}-06T18:00`, tipo_jornada: "completa" },
      { tipo: "salida", t: `${Y}-${M}-07T00:30`, tipo_jornada: "completa" },
    ],
  },
  {
    titulo: "Doble jornada mismo día (09-13 y 18-22)",
    registros: [
      { tipo: "entrada", t: `${Y}-${M}-08T09:00`, tipo_jornada: "completa" },
      { tipo: "salida", t: `${Y}-${M}-08T13:00`, tipo_jornada: "completa" },
      { tipo: "entrada", t: `${Y}-${M}-08T18:00`, tipo_jornada: "completa" },
      { tipo: "salida", t: `${Y}-${M}-08T22:00`, tipo_jornada: "completa" },
    ],
  },
  {
    titulo: "Turno abierto: solo entrada (Sáb 10:00, sin salida)",
    registros: [
      { tipo: "entrada", t: `${Y}-${M}-09T10:00`, tipo_jornada: "completa" },
    ],
  },
  {
    titulo: "Salida huérfana: solo salida (Mar 17:00, sin entrada previa)",
    registros: [
      { tipo: "salida", t: `${Y}-${M}-12T17:00`, tipo_jornada: "completa" },
    ],
  },
  {
    titulo: "Madrugada larga (Dom 23:00 → Lun 02:00 = 3h) → badge +1 día",
    registros: [
      { tipo: "entrada", t: `${Y}-${M}-10T23:00`, tipo_jornada: "completa" },
      { tipo: "salida", t: `${Y}-${M}-11T02:00`, tipo_jornada: "completa" },
    ],
  },
  {
    titulo: "Borde de mes: entra el 31 23:00 → sale el 1 del mes que viene 00:45 (prueba el buffer)",
    registros: [
      { tipo: "entrada", t: `${Y}-${M}-31T23:00`, tipo_jornada: "completa" },
      { tipo: "salida", t: `${Y}-06-01T00:45`, tipo_jornada: "completa" },
    ],
  },
  {
    titulo: "Fichaje cargado tarde (registrado_tarde) → badge ⏱",
    registros: [
      {
        tipo: "entrada",
        t: `${Y}-${M}-14T08:00`,
        tipo_jornada: "completa",
        registrado_tarde: true,
      },
      {
        tipo: "salida",
        t: `${Y}-${M}-14T16:00`,
        tipo_jornada: "completa",
        registrado_tarde: true,
      },
    ],
  },
];

// --- Resolver empleado ---
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

// --- Borrar pruebas anteriores de este empleado ---
const { error: delErr } = await db
  .from("time_records")
  .delete()
  .eq("employee_id", emp.id)
  .eq("nota", NOTA);
if (delErr) {
  console.error("Error borrando pruebas previas:", delErr.message);
  process.exit(1);
}

// --- Insertar casos ---
const filas = [];
for (const caso of CASOS) {
  for (const r of caso.registros) {
    filas.push({
      employee_id: emp.id,
      tipo: r.tipo,
      tipo_jornada: r.tipo_jornada ?? "completa",
      extra_modo: r.extra_modo ?? null,
      nota: NOTA,
      foto_path: null,
      foto_url: null,
      registrado_tarde: r.registrado_tarde ?? false,
      timestamp: ts(r.t),
    });
  }
}

const { error: insErr } = await db.from("time_records").insert(filas);
if (insErr) {
  console.error("Error insertando casos:", insErr.message);
  process.exit(1);
}

console.log(`✓ ${filas.length} registros insertados para ${emp.nombre} ${emp.apellido}.\n`);
console.log("Casos cargados:");
for (const c of CASOS) console.log(`  • ${c.titulo}`);
console.log(
  `\nAbrí /mi-historial (logueado como ${emp.nombre}) o el panel admin del empleado.`,
);
console.log("Para limpiar: volvé a correr este script (borra los [PRUEBA] antes de insertar).");
