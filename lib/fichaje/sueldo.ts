// Cálculo de sueldo. Regla de negocio del contrato:
//   tarifa_diaria = sueldo_mensual / 30   (o override)
//   tarifa_horaria = tarifa_diaria / horas_jornada_estandar   (o override)
// El total de un período = días completos a tarifa diaria + extras (opcionales).
// Las tarifas se resuelven por día contra salary_history (fila vigente <= ese día).

import type {
  ExtraModo,
  ExtraFracciones,
  SalaryHistory,
  TimeRecord,
} from "./types";
import { DEFAULT_EXTRA_FRACCIONES } from "./types";
import { diaISOAR } from "./fechas";

const DIAS_MES = 30;

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

// Un turno emparejado por día. Al menos uno de entrada/salida es no-nulo.
//   entrada + salida → completo
//   entrada + null   → falta la salida (turno abierto)
//   null + salida    → falta la entrada (salida huérfana)
export interface ParFichaje {
  fechaISO: string; // YYYY-MM-DD del día
  entrada: TimeRecord | null;
  salida: TimeRecord | null;
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

function horasEntre(entrada: string, salida: string): number {
  const ms = new Date(salida).getTime() - new Date(entrada).getTime();
  return Math.max(0, ms / 3_600_000);
}

// Calcula el resumen del período a partir de pares ya emparejados.
export function calcularPeriodo(
  pares: ParFichaje[],
  historial: SalaryHistory[],
  opts: { incluirExtras: boolean; fracciones?: ExtraFracciones },
): ResumenPeriodo {
  const fracciones = opts.fracciones ?? DEFAULT_EXTRA_FRACCIONES;
  const dias: DiaCalculado[] = [];

  let diasCompletos = 0;
  let totalBase = 0;
  let cantidadExtras = 0;
  let totalExtras = 0;

  for (const par of pares) {
    const { tarifaDiaria, tarifaHoraria } = tarifaParaFecha(
      par.fechaISO,
      historial,
    );

    // Salida huérfana (falta la entrada): no se puede calcular, queda incompleto.
    if (!par.entrada) {
      dias.push({
        fechaISO: par.fechaISO,
        tipo: par.salida?.tipo_jornada ?? "completa",
        extraModo: par.salida?.extra_modo ?? null,
        horas: null,
        subtotal: 0,
        cerrado: false,
        nota: par.salida?.nota ?? null,
      });
      continue;
    }

    const cerrado = par.salida != null;
    const tipo = par.entrada.tipo_jornada;
    const extraModo = par.entrada.extra_modo;
    const horas =
      par.salida != null
        ? horasEntre(par.entrada.timestamp, par.salida.timestamp)
        : null;

    let subtotal = 0;

    if (tipo === "completa") {
      // Día completo cuenta solo si está cerrado.
      if (cerrado) {
        subtotal = tarifaDiaria;
        diasCompletos += 1;
        totalBase += subtotal;
      }
    } else {
      // extra: solo cuenta si está cerrado (par completo).
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
      fechaISO: par.fechaISO,
      tipo,
      extraModo,
      horas,
      subtotal,
      cerrado,
      nota: par.entrada.nota,
    });
  }

  const total = totalBase + (opts.incluirExtras ? totalExtras : 0);

  return {
    dias,
    diasCompletos,
    totalBase,
    cantidadExtras,
    totalExtras,
    total,
  };
}

// Duración máxima de un turno: una salida solo cierra una entrada si pasaron
// menos horas que esto. Cubre turnos que cruzan la medianoche (ej. cierre 04:00
// que cierra la entrada de las 18:00 = 10h) pero evita que una entrada con salida
// olvidada se empareje con una salida de otro día.
export const MAX_TURNO_HORAS = 12;
const MAX_TURNO_MS = MAX_TURNO_HORAS * 60 * 60 * 1000;

// Empareja registros crudos (ordenados por timestamp asc) en pares entrada→salida por día.
export function emparejarFichajes(registros: TimeRecord[]): ParFichaje[] {
  const ordenados = [...registros].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : 1,
  );
  const pares: ParFichaje[] = [];
  const porId = new Map(ordenados.map((r) => [r.id, r] as const));
  const consumido = new Set<string>();

  // 1) Pares EXPLÍCITOS: cuando el empleado completó un hueco puntual, el nuevo
  // registro guarda enlace_id apuntando a su hermano. Ese vínculo manda sobre la
  // heurística por tiempo y NO está atado al tope de 12h (cierra turnos largos o
  // cargados días después). Anclado al día de la entrada.
  for (const r of ordenados) {
    if (consumido.has(r.id) || !r.enlace_id) continue;
    const otro = porId.get(r.enlace_id);
    if (!otro || otro.id === r.id || consumido.has(otro.id)) continue;
    if (otro.tipo === r.tipo) continue; // mismo tipo: no es un par válido
    const entrada = r.tipo === "entrada" ? r : otro;
    const salida = r.tipo === "salida" ? r : otro;
    consumido.add(r.id);
    consumido.add(otro.id);
    pares.push({ fechaISO: diaISOAR(entrada.timestamp), entrada, salida });
  }

  // 2) RESTO: emparejado por tiempo (FIFO + tope 12h), salteando los ya consumidos.
  // Cola FIFO de entradas abiertas por empleado: cada salida cierra la más vieja
  // que siga dentro del turno máximo. Soporta doble jornada (varias entradas).
  const abiertas = new Map<string, ParFichaje[]>();

  for (const r of ordenados) {
    if (consumido.has(r.id)) continue;
    const fechaISO = diaISOAR(r.timestamp); // día calendario en hora AR
    if (r.tipo === "entrada") {
      const par: ParFichaje = { fechaISO, entrada: r, salida: null };
      pares.push(par);
      const cola = abiertas.get(r.employee_id) ?? [];
      cola.push(par);
      abiertas.set(r.employee_id, cola);
    } else {
      // salida: cerrar la entrada abierta más vieja del empleado que entre en el
      // turno máximo. Las entradas más viejas que eso quedan abiertas (olvidaron
      // fichar la salida) y se descartan de la cola.
      const cola = abiertas.get(r.employee_id);
      const salidaMs = new Date(r.timestamp).getTime();
      let abierta: ParFichaje | undefined;
      while (cola && cola.length > 0) {
        const cand = cola[0]!;
        const entradaMs = new Date(cand.entrada!.timestamp).getTime();
        if (salidaMs - entradaMs > MAX_TURNO_MS) {
          cola.shift(); // demasiado vieja: queda como turno abierto
          continue;
        }
        abierta = cola.shift();
        break;
      }
      if (abierta) {
        abierta.salida = r;
      } else {
        // salida huérfana (sin entrada válida previa): fila con entrada faltante.
        pares.push({ fechaISO, entrada: null, salida: r });
      }
    }
  }

  // Orden cronológico estable por el registro que exista.
  pares.sort((a, b) => {
    const ta = (a.entrada ?? a.salida)!.timestamp;
    const tb = (b.entrada ?? b.salida)!.timestamp;
    return ta < tb ? -1 : 1;
  });

  return pares;
}

export function formatARS(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}
