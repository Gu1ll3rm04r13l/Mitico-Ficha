// Formateo de fechas/horas SIEMPRE en horario de Argentina, sin importar el TZ
// del runtime (en Vercel el server corre en UTC). Los timestamps se guardan como
// timestamptz (instante absoluto); acá los mostramos en hora local del local.
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";

export const TZ_AR = "America/Argentina/Buenos_Aires";

// Formatea un instante (Date o ISO string) con tokens de date-fns, en hora AR.
export function formatAR(ts: string | Date, pattern: string): string {
  return formatInTimeZone(ts, TZ_AR, pattern, { locale: es });
}

// Hora 24 h: "18:30".
export function horaAR(ts: string | Date): string {
  return formatInTimeZone(ts, TZ_AR, "HH:mm");
}

// YYYY-MM-DD del instante en hora AR (para agrupar por día / detectar cruce de medianoche).
export function diaISOAR(ts: string | Date): string {
  return formatInTimeZone(ts, TZ_AR, "yyyy-MM-dd");
}

// Días de calendario (en AR) entre dos instantes. 0 = mismo día, 1 = madrugada siguiente.
export function diasCruzadosAR(entrada: string | Date, salida: string | Date): number {
  const a = new Date(`${diaISOAR(entrada)}T00:00:00Z`).getTime();
  const b = new Date(`${diaISOAR(salida)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
