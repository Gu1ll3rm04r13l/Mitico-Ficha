import { notFound } from "next/navigation";
import Link from "next/link";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import {
  getEmpleadoAdmin,
  getSalaryHistory,
  getFraccionesExtra,
} from "@/lib/fichaje/admin";
import { getTurnosMes, mesActual } from "@/lib/fichaje/historial";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularPeriodo, formatARS } from "@/lib/fichaje/sueldo";
import { MesSelector } from "@/components/empleado/MesSelector";
import { ConfigSueldoForm } from "@/components/admin/ConfigSueldoForm";
import { EmpleadoAcciones } from "@/components/admin/EmpleadoAcciones";
import { SueldoSummary } from "@/components/admin/SueldoSummary";
import { Card } from "@/components/ui/Card";
import { SelfieGallery, type SelfieItem } from "@/components/admin/SelfieGallery";
import {
  TurnosAdminTable,
  type FilaTurno,
} from "@/components/admin/TurnosAdminTable";

export const dynamic = "force-dynamic";

export default async function EmpleadoDetalle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes: mesParam } = await searchParams;
  const mes = mesParam ?? mesActual();

  const empleado = await getEmpleadoAdmin(id);
  if (!empleado) notFound();

  const [historial, fracciones, turnos] = await Promise.all([
    getSalaryHistory(id),
    getFraccionesExtra(),
    getTurnosMes(id, mes),
  ]);

  // Firmar URLs de las selfies presentes (entrada + salida).
  const paths = turnos
    .flatMap((t) => [t.entrada_foto_path, t.salida_foto_path])
    .filter((p): p is string => !!p);
  const firmadas = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await createServiceClient()
      .storage.from("fichaje-selfies")
      .createSignedUrls(paths, 3600);
    data?.forEach((d) => {
      if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
    });
  }

  const resumen = calcularPeriodo(turnos, historial, {
    incluirExtras: true,
    fracciones,
  });

  // Galería: hasta 2 fotos por turno (entrada + salida).
  const galeria: SelfieItem[] = [];
  for (const t of turnos) {
    if (t.entrada_foto_path && firmadas.has(t.entrada_foto_path)) {
      galeria.push({
        url: firmadas.get(t.entrada_foto_path) as string,
        timestamp: t.entrada_at,
        marca: "entrada",
        tipoJornada: t.tipo_jornada,
        extraModo: t.extra_modo,
        nota: t.nota,
      });
    }
    if (t.salida_at && t.salida_foto_path && firmadas.has(t.salida_foto_path)) {
      galeria.push({
        url: firmadas.get(t.salida_foto_path) as string,
        timestamp: t.salida_at,
        marca: "salida",
        tipoJornada: t.tipo_jornada,
        extraModo: t.extra_modo,
        nota: t.nota,
      });
    }
  }

  const nombreCompleto = `${empleado.nombre} ${empleado.apellido ?? ""}`.trim();

  const filas: FilaTurno[] = turnos.map((t, i) => {
    const d = resumen.dias[i]!;
    const entradaUrl = t.entrada_foto_path
      ? (firmadas.get(t.entrada_foto_path) ?? null)
      : null;
    const salidaUrl = t.salida_foto_path
      ? (firmadas.get(t.salida_foto_path) ?? null)
      : null;
    return {
      id: t.id,
      fechaTxt: formatAR(t.entrada_at, "dd/MM/yy"),
      tipoJornada: t.tipo_jornada,
      extraModo: t.extra_modo,
      entradaHora: horaAR(t.entrada_at),
      entradaUrl,
      entradaManual: t.entrada_manual,
      entradaDetalle:
        t.entrada_foto_path && firmadas.has(t.entrada_foto_path)
          ? {
              item: {
                url: firmadas.get(t.entrada_foto_path)!,
                timestamp: t.entrada_at,
                marca: "entrada",
                tipoJornada: t.tipo_jornada,
                extraModo: t.extra_modo,
                nota: t.nota,
              },
              nombreCompleto,
              rol: empleado.rol,
            }
          : undefined,
      salidaAbierto: !t.salida_at,
      salidaHora: t.salida_at ? horaAR(t.salida_at) : "",
      salidaUrl,
      salidaManual: t.salida_manual,
      salidaDetalle:
        t.salida_at && t.salida_foto_path && firmadas.has(t.salida_foto_path)
          ? {
              item: {
                url: firmadas.get(t.salida_foto_path)!,
                timestamp: t.salida_at,
                marca: "salida",
                tipoJornada: t.tipo_jornada,
                extraModo: t.extra_modo,
                nota: t.nota,
              },
              nombreCompleto,
              rol: empleado.rol,
            }
          : undefined,
      nota: t.nota,
      horasTxt: d.horas != null ? d.horas.toFixed(1) : "—",
      subtotalTxt: d.subtotal > 0 ? formatARS(d.subtotal) : "—",
      borrarEtiqueta: `turno del ${formatAR(t.entrada_at, "dd/MM/yy")}`,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/empleados" className="text-sm text-muted">
          ← Empleados
        </Link>
        <h1 className="mt-2 font-heading text-4xl text-cream">
          {empleado.nombre} {empleado.apellido ?? ""}
        </h1>
        <p className="text-muted">{empleado.rol ?? "Sin puesto"}</p>
      </div>

      <Card>
        <EmpleadoAcciones empleado={empleado} />
      </Card>

      <Card>
        <h2 className="mb-4 font-heading text-2xl text-cream">
          Configuración de pago
        </h2>
        <ConfigSueldoForm empleado={empleado} />
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-2xl text-cream">Período</h2>
        <MesSelector mes={mes} />
      </div>

      <TurnosAdminTable filas={filas} />

      <SueldoSummary
        diasCompletos={resumen.diasCompletos}
        totalBase={resumen.totalBase}
        cantidadExtras={resumen.cantidadExtras}
        totalExtras={resumen.totalExtras}
      />

      <section className="space-y-4">
        <h2 className="font-heading text-2xl text-cream">Fotos del mes</h2>
        <SelfieGallery
          items={galeria}
          nombre={empleado.nombre}
          apellido={empleado.apellido}
          rol={empleado.rol}
        />
      </section>
    </div>
  );
}
