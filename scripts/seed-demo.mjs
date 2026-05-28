// Seed DEMO completo para auditar el sistema end-to-end.
//   1. Borra TODOS los turnos y vacía el bucket de selfies.
//   2. Carga salary_history por empleado (vigente desde 2026-01-01).
//   3. Inserta turnos de abril y mayo 2026 cubriendo todos los casos de cálculo.
//   4. Imprime los subtotales ESPERADOS (oráculo) para comparar contra la UI.
//
// Mantiene los empleados TEST (no los borra). Re-ejecutable (idempotente: limpia antes).
// Uso: node scripts/seed-demo.mjs
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
const BUCKET = "fichaje-selfies";
const TZ = "-03:00";
const DIAS_MES = 30;

// ---------- Config de sueldo por empleado (clave = "Nombre Apellido") ----------
const SUELDOS = {
  "Lucía Fernández":  { sueldo_mensual: 1400000, horas_jornada_estandar: 8 },
  "Marcos Pereyra":   { sueldo_mensual: 1200000, horas_jornada_estandar: 8 },
  "Sofía Gómez":      { sueldo_mensual: 1500000, horas_jornada_estandar: 8 },
  "Diego Ramírez":    { sueldo_diario_override: 48000, tarifa_hora_override: 6000, horas_jornada_estandar: 8 },
  "Valentina Torres": { sueldo_mensual: 1300000, horas_jornada_estandar: 9 },
};
const VIGENTE_DESDE = "2026-01-01";

// ---------- Plantillas de turnos por mes ----------
// in/out en HH:MM ART. outDay=1 => salida al día siguiente (cruce de medianoche).
// MAYO: mes completo con todos los casos. ABRIL: distinto (menos días) para
// comprobar a simple vista que el selector de mes filtra de verdad.
const PLANTILLA_MAYO = [
  { d: 2,  tipo: "completa", in: "09:00", out: "17:00", nota: null },
  { d: 3,  tipo: "completa", in: "09:00", out: "17:30", nota: null },
  { d: 5,  tipo: "completa", in: "18:00", out: "02:00", outDay: 1, nota: "Cierre nocturno" },
  { d: 7,  tipo: "extra", modo: "horas", in: "18:00", out: "22:00", nota: "Refuerzo 4h" },
  { d: 9,  tipo: "extra", modo: "medio", in: "12:00", out: "16:00", nota: null },
  { d: 12, tipo: "completa", in: "08:00", out: "16:00", entrada_manual: true, salida_manual: true, nota: "Cargado a mano" },
  { d: 14, tipo: "extra", modo: "cuarto", in: "20:00", out: "22:00", nota: null },
  { d: 16, tipo: "completa", in: "09:00", out: "17:00", nota: null },
  { d: 19, tipo: "completa", in: "09:00", out: "17:00", nota: null },
  { d: 21, tipo: "extra", modo: "completo", in: "10:00", out: "19:00", nota: "Cubrió franco" },
  { d: 23, tipo: "completa", in: "17:00", out: "23:30", nota: null },
  { d: 26, tipo: "completa", in: "09:00", out: "17:00", nota: null },
];
const PLANTILLA_ABRIL = [
  { d: 4,  tipo: "completa", in: "10:00", out: "18:00", nota: null },
  { d: 8,  tipo: "completa", in: "10:00", out: "18:00", nota: null },
  { d: 11, tipo: "extra", modo: "medio", in: "13:00", out: "17:00", nota: "Evento" },
  { d: 15, tipo: "completa", in: "10:00", out: "18:00", nota: null },
  { d: 22, tipo: "extra", modo: "horas", in: "19:00", out: "23:00", nota: "Refuerzo 4h" },
  { d: 28, tipo: "completa", in: "10:00", out: "18:00", nota: null },
];

function ts(year, month, day, hhmm) {
  const dd = String(day).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${dd}T${hhmm}:00${TZ}`;
}
function horasEntre(entradaISO, salidaISO) {
  return Math.max(0, (new Date(salidaISO) - new Date(entradaISO)) / 3_600_000);
}

// Réplica EXACTA de lib/fichaje/sueldo.ts para calcular el subtotal esperado.
function tarifas(cfg) {
  const horas = cfg.horas_jornada_estandar || 8;
  const diaria =
    cfg.sueldo_diario_override ??
    (cfg.sueldo_mensual != null ? cfg.sueldo_mensual / DIAS_MES : 0);
  const horaria = cfg.tarifa_hora_override ?? (diaria > 0 ? diaria / horas : 0);
  return { diaria, horaria };
}
const FRACC = { cuarto: 0.25, medio: 0.5, completo: 1.0 };
function subtotalEsperado(turno, cfg) {
  const { diaria, horaria } = tarifas(cfg);
  const cerrado = turno.salida_at != null;
  if (turno.tipo_jornada === "completa") return cerrado ? diaria : 0;
  if (!cerrado || !turno.extra_modo) return 0;
  if (turno.extra_modo === "horas") return horasEntre(turno.entrada_at, turno.salida_at) * horaria;
  return FRACC[turno.extra_modo] * diaria;
}

function construirTurnos(empId, year, month, plantilla) {
  return plantilla.map((c) => {
    const entrada_at = ts(year, month, c.d, c.in);
    const salida_at = ts(year, month, c.d + (c.outDay ?? 0), c.out);
    return {
      employee_id: empId,
      tipo_jornada: c.tipo,
      extra_modo: c.modo ?? null,
      nota: c.nota ?? null,
      entrada_at,
      entrada_manual: c.entrada_manual ?? false,
      salida_at,
      salida_manual: c.salida_manual ?? false,
    };
  });
}

// Borra recursivamente todo el contenido de un bucket de Storage.
async function vaciarBucket(prefix = "") {
  const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) { console.warn(`  ⚠ no pude listar "${prefix}": ${error.message}`); return 0; }
  let borrados = 0;
  const archivos = [];
  for (const item of data) {
    const ruta = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) borrados += await vaciarBucket(ruta); // carpeta
    else archivos.push(ruta);
  }
  if (archivos.length) {
    const { error: rmErr } = await sb.storage.from(BUCKET).remove(archivos);
    if (rmErr) console.warn(`  ⚠ error borrando archivos: ${rmErr.message}`);
    else borrados += archivos.length;
  }
  return borrados;
}

const fmt = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

// ===================== EJECUCIÓN =====================
console.log("== 1) Resolviendo empleados TEST ==");
const { data: emps, error: empErr } = await db
  .from("employees")
  .select("id, nombre, apellido")
  .in("nombre", ["Lucía", "Marcos", "Sofía", "Diego", "Valentina"]);
if (empErr) { console.error(empErr.message); process.exit(1); }
const byKey = new Map(emps.map((e) => [`${e.nombre} ${e.apellido}`, e]));
const faltan = Object.keys(SUELDOS).filter((k) => !byKey.has(k));
if (faltan.length) {
  console.error("Faltan empleados:", faltan.join(", "), "\nCorré primero: node scripts/seed-empleados.mjs");
  process.exit(1);
}
console.log(`  ✓ ${byKey.size} empleados encontrados.`);

console.log("\n== 2) Limpieza ==");
const { count: turnosAntes } = await db.from("turnos").select("*", { count: "exact", head: true });
const { error: delT } = await db.from("turnos").delete().not("id", "is", null);
if (delT) { console.error("Error borrando turnos:", delT.message); process.exit(1); }
console.log(`  ✓ turnos borrados (había ${turnosAntes ?? "?"}).`);
const fotos = await vaciarBucket();
console.log(`  ✓ ${fotos} foto(s) borradas del bucket "${BUCKET}".`);

console.log("\n== 3) Config de sueldo (salary_history) ==");
for (const [key, emp] of byKey) {
  await db.from("salary_history").delete().eq("employee_id", emp.id);
  const cfg = SUELDOS[key];
  const { error } = await db.from("salary_history").insert({
    employee_id: emp.id,
    sueldo_mensual: cfg.sueldo_mensual ?? null,
    sueldo_diario_override: cfg.sueldo_diario_override ?? null,
    tarifa_hora_override: cfg.tarifa_hora_override ?? null,
    horas_jornada_estandar: cfg.horas_jornada_estandar,
    vigente_desde: VIGENTE_DESDE,
  });
  if (error) { console.error(`  ✗ ${key}: ${error.message}`); process.exit(1); }
  // Espejo en employees (para que el form muestre los valores actuales).
  await db.from("employees").update({
    sueldo_mensual: cfg.sueldo_mensual ?? null,
    sueldo_diario_override: cfg.sueldo_diario_override ?? null,
    tarifa_hora_override: cfg.tarifa_hora_override ?? null,
    horas_jornada_estandar: cfg.horas_jornada_estandar,
  }).eq("id", emp.id);
  const { diaria, horaria } = tarifas(cfg);
  console.log(`  ✓ ${key}: diaria ${fmt(diaria)} · horaria ${fmt(horaria)}`);
}

console.log("\n== 4) Insertando turnos (abril + mayo 2026) ==");
const MESES = [
  { year: 2026, month: 4, nombre: "abril", plantilla: PLANTILLA_ABRIL },
  { year: 2026, month: 5, nombre: "mayo", plantilla: PLANTILLA_MAYO },
];
for (const [key, emp] of byKey) {
  for (const mes of MESES) {
    const filas = construirTurnos(emp.id, mes.year, mes.month, mes.plantilla);
    const { error } = await db.from("turnos").insert(filas);
    if (error) { console.error(`  ✗ ${key} ${mes.nombre}: ${error.message}`); process.exit(1); }
  }
}
// Turno abierto (fichado ahora) para Lucía, hoy.
const lucia = byKey.get("Lucía Fernández");
await db.from("turnos").insert({
  employee_id: lucia.id, tipo_jornada: "completa", extra_modo: null,
  nota: "Turno en curso", entrada_at: ts(2026, 5, 27, "16:00"),
  entrada_manual: false, salida_at: null, salida_manual: false,
});
console.log(`  ✓ ${byKey.size} empleados: mayo ${PLANTILLA_MAYO.length} + abril ${PLANTILLA_ABRIL.length} turnos c/u + 1 turno abierto (Lucía).`);

console.log("\n== 5) Subtotales ESPERADOS — mayo 2026 (oráculo para auditar la UI) ==");
for (const [key, emp] of byKey) {
  const cfg = SUELDOS[key];
  const turnos = construirTurnos(emp.id, 2026, 5, PLANTILLA_MAYO);
  let base = 0, extras = 0, nCompletos = 0, nExtras = 0;
  console.log(`\n  ${key}`);
  for (const t of turnos) {
    const sub = subtotalEsperado(t, cfg);
    const etiqueta = t.tipo_jornada === "completa" ? "Jornada" : `Extra ${t.extra_modo}`;
    const dia = t.entrada_at.slice(8, 10);
    console.log(`    ${dia}/05  ${etiqueta.padEnd(14)} ${fmt(sub)}`);
    if (t.tipo_jornada === "completa") { base += sub; nCompletos++; }
    else { extras += sub; nExtras++; }
  }
  console.log(`    ── Días completos: ${nCompletos} = ${fmt(base)} · Extras: ${nExtras} = ${fmt(extras)} · TOTAL ${fmt(base + extras)}`);
}

console.log("\n✅ Listo. Abrí /admin/empleados → un empleado → mes mayo y comprobá que coincide.");
console.log("   (Las selfies quedan vacías: solo se generan al fichar de verdad con cámara.)");
