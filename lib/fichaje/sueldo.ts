// Cálculo de sueldo. Regla de negocio del contrato:
//   tarifa_diaria = sueldo_mensual / 30   (o override)
//   tarifa_horaria = tarifa_diaria / horas_jornada_estandar   (o override)
// El total de un período = días completos a tarifa diaria + extras (opcionales).
// Las tarifas se resuelven por día contra salary_history (fila vigente <= ese día).

import type {
  ExtraModo,
  ExtraFracciones,
  SalaryHistory,
  Turno,
} from "./types";
import { DEFAULT_EXTRA_FRACCIONES } from "./types";
import { diaISOAR } from "./fechas";

export const DIAS_MES = 30;

export interface TarifaVigente {
  tarifaDiaria: number;
  tarifaHoraria: number;
}

// Resuelve la tarifa que aplica a un día dado (YYYY-MM-DD) contra el historial.
export function tarifaParaFecha(
  fechaISO: string,
  historial: SalaryHistory[],
): TarifaVigente {
  // historial ordenado desc por vigente_desde; tomar la primera fila <= fecha.
  const vigente =
    historial
      .filter((h) => h.vigente_desde <= fechaISO)
      .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0] ?? null;

  if (!vigente) return { tarifaDiaria: 0, tarifaHoraria: 0 };

  const horasJornada = vigente.horas_jornada_estandar || 8;
  const tarifaDiaria =
    vigente.sueldo_diario_override ??
    (vigente.sueldo_mensual != null ? vigente.sueldo_mensual / DIAS_MES : 0);
  const tarifaHoraria =
    vigente.tarifa_hora_override ??
    (tarifaDiaria > 0 ? tarifaDiaria / horasJornada : 0);

  return { tarifaDiaria, tarifaHoraria };
}

export function fraccionExtra(
  modo: ExtraModo,
  fracciones: ExtraFracciones = DEFAULT_EXTRA_FRACCIONES,
): number {
  switch (modo) {
    case "cuarto":
      return fracciones.cuarto;
    case "medio":
      return fracciones.medio;
    case "completo":
      return fracciones.completo;
    case "horas":
      return 0; // las horas se valúan aparte (horas reales × tarifa horaria)
  }
}

export interface DiaCalculado {
  fechaISO: string;
  tipo: "completa" | "extra";
  extraModo: ExtraModo | null;
  horas: number | null; // horas reales si hay salida
  subtotal: number;
  cerrado: boolean; // tiene salida
  nota: string | null;
}

export interface ResumenPeriodo {
  dias: DiaCalculado[];
  diasCompletos: number;
  totalBase: number;
  cantidadExtras: number;
  totalExtras: number;
  total: number; // con o sin extras según incluirExtras
}

export function horasEntre(entrada: string, salida: string): number {
  const ms = new Date(salida).getTime() - new Date(entrada).getTime();
  return Math.max(0, ms / 3_600_000);
}

// Calcula el resumen del período a partir de los turnos del mes.
export function calcularPeriodo(
  turnos: Turno[],
  historial: SalaryHistory[],
  opts: { incluirExtras: boolean; fracciones?: ExtraFracciones },
): ResumenPeriodo {
  const fracciones = opts.fracciones ?? DEFAULT_EXTRA_FRACCIONES;
  const dias: DiaCalculado[] = [];

  let diasCompletos = 0;
  let totalBase = 0;
  let cantidadExtras = 0;
  let totalExtras = 0;

  for (const t of turnos) {
    const fechaISO = diaISOAR(t.entrada_at);
    const { tarifaDiaria, tarifaHoraria } = tarifaParaFecha(fechaISO, historial);

    const cerrado = t.salida_at != null;
    const horas = cerrado ? horasEntre(t.entrada_at, t.salida_at as string) : null;
    const tipo = t.tipo_jornada;
    const extraModo = t.extra_modo;

    let subtotal = 0;

    if (tipo === "completa") {
      if (cerrado) {
        subtotal = tarifaDiaria;
        diasCompletos += 1;
        totalBase += subtotal;
      }
    } else {
      if (cerrado && extraModo) {
        if (extraModo === "horas") {
          subtotal = (horas ?? 0) * tarifaHoraria;
        } else {
          subtotal = fraccionExtra(extraModo, fracciones) * tarifaDiaria;
        }
        cantidadExtras += 1;
        totalExtras += subtotal;
      }
    }

    dias.push({
      fechaISO,
      tipo,
      extraModo,
      horas,
      subtotal,
      cerrado,
      nota: t.nota,
    });
  }

  const total = totalBase + (opts.incluirExtras ? totalExtras : 0);

  return { dias, diasCompletos, totalBase, cantidadExtras, totalExtras, total };
}

export function formatARS(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}
