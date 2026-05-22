// Tests de calcularPeriodo sobre el modelo turno-fila.
// Run: npm test   (usa tsx). Sale con código 1 si algo falla.
import assert from "node:assert/strict";
import { calcularPeriodo } from "../lib/fichaje/sueldo";
import type { SalaryHistory, Turno } from "../lib/fichaje/types";

let pasados = 0;
function test(nombre: string, fn: () => void) {
  try {
    fn();
    pasados++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    console.error(`  ✗ ${nombre}`);
    console.error(e);
    process.exit(1);
  }
}

// Empleado con sueldo mensual 30000 → diaria 1000, horaria 125 (8h).
const historial: SalaryHistory[] = [
  {
    id: "h1",
    employee_id: "e1",
    sueldo_mensual: 30000,
    sueldo_diario_override: null,
    tarifa_hora_override: null,
    horas_jornada_estandar: 8,
    vigente_desde: "2026-05-01",
    created_at: "2026-05-01T00:00:00Z",
  },
];

function turno(p: Partial<Turno> & Pick<Turno, "entrada_at">): Turno {
  return {
    id: Math.random().toString(36).slice(2),
    employee_id: "e1",
    tipo_jornada: "completa",
    extra_modo: null,
    nota: null,
    entrada_foto_url: null,
    entrada_foto_path: null,
    entrada_manual: false,
    salida_at: null,
    salida_foto_url: null,
    salida_foto_path: null,
    salida_manual: false,
    created_at: "2026-05-04T00:00:00Z",
    updated_at: "2026-05-04T00:00:00Z",
    ...p,
  };
}

console.log("calcularPeriodo:");

test("turno completo cerrado cuenta 1 día completo", () => {
  const turnos = [
    turno({ entrada_at: "2026-05-04T12:00:00Z", salida_at: "2026-05-04T20:00:00Z" }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.diasCompletos, 1);
  assert.equal(r.totalBase, 1000);
  assert.equal(r.dias[0]!.cerrado, true);
  assert.equal(r.dias[0]!.horas, 8);
});

test("turno abierto (sin salida) no cuenta", () => {
  const turnos = [turno({ entrada_at: "2026-05-05T12:00:00Z" })];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.diasCompletos, 0);
  assert.equal(r.totalBase, 0);
  assert.equal(r.dias[0]!.cerrado, false);
  assert.equal(r.dias[0]!.horas, null);
});

test("extra por horas vale horas reales × tarifa horaria", () => {
  const turnos = [
    turno({
      tipo_jornada: "extra",
      extra_modo: "horas",
      entrada_at: "2026-05-06T12:00:00Z",
      salida_at: "2026-05-06T16:00:00Z", // 4h
    }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.cantidadExtras, 1);
  assert.equal(r.totalExtras, 4 * 125);
  assert.equal(r.diasCompletos, 0);
});

test("extra fracción 1/2 vale media diaria", () => {
  const turnos = [
    turno({
      tipo_jornada: "extra",
      extra_modo: "medio",
      entrada_at: "2026-05-07T12:00:00Z",
      salida_at: "2026-05-07T16:00:00Z",
    }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.totalExtras, 500);
});

test("incluirExtras=false excluye extras del total", () => {
  const turnos = [
    turno({ entrada_at: "2026-05-04T12:00:00Z", salida_at: "2026-05-04T20:00:00Z" }),
    turno({
      tipo_jornada: "extra",
      extra_modo: "medio",
      entrada_at: "2026-05-07T12:00:00Z",
      salida_at: "2026-05-07T16:00:00Z",
    }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: false });
  assert.equal(r.total, 1000); // solo base
  assert.equal(r.totalExtras, 500); // se reporta pero no se suma
});

console.log(`\n${pasados} tests OK`);
