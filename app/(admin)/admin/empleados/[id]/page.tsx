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
import { calcularPeriodo } from "@/lib/fichaje/sueldo";
import { MesSelector } from "@/components/empleado/MesSelector";
import { ConfigSueldoForm } from "@/components/admin/ConfigSueldoForm";
import { EmpleadoAcciones } from "@/components/admin/EmpleadoAcciones";
import { SueldoSummary } from "@/components/admin/SueldoSummary";
import { Card } from "@/components/ui/Card";
import { SelfieThumb } from "@/components/admin/SelfieThumb";
import { BorrarFichajeBtn } from "@/components/admin/BorrarFichajeBtn";
import { SelfieGallery, type SelfieItem } from "@/components/admin/SelfieGallery";
import { TipoTurnoEditor } from "@/components/admin/TipoTurnoEditor";
import { BadgeManual } from "@/components/fichaje/BadgeManual";

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

      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl text-cream">Período</h2>
        <MesSelector mes={mes} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-muted/15">
        <table className="w-full text-sm">
          <thead className="bg-bg-card text-muted">
            <tr>
              <th className="px-3 py-3 text-left">Fecha</th>
              <th className="px-3 py-3 text-left">Tipo</th>
              <th className="px-3 py-3 text-left">Entrada</th>
              <th className="px-3 py-3 text-left">Salida</th>
              <th className="px-3 py-3 text-left">Notas</th>
              <th className="px-3 py-3 text-right">Horas</th>
              <th className="px-3 py-3 text-right">Subtotal</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {turnos.map((t, i) => {
              const d = resumen.dias[i]!;
              return (
                <tr key={t.id} className="border-t border-muted/10">
                  <td className="px-3 py-3 text-cream">
                    {formatAR(t.entrada_at, "EEE d")}
                  </td>
                  <td className="px-3 py-3">
                    <TipoTurnoEditor
                      turnoId={t.id}
                      tipoInicial={t.tipo_jornada}
                      extraInicial={t.extra_modo}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <SelfieThumb
                        url={
                          t.entrada_foto_path
                            ? (firmadas.get(t.entrada_foto_path) ?? null)
                            : null
                        }
                        hora={horaAR(t.entrada_at)}
                      />
                      {t.entrada_manual && <BadgeManual />}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {t.salida_at ? (
                      <div className="flex items-center gap-2">
                        <SelfieThumb
                          url={
                            t.salida_foto_path
                              ? (firmadas.get(t.salida_foto_path) ?? null)
                              : null
                          }
                          hora={horaAR(t.salida_at)}
                        />
                        {t.salida_manual && <BadgeManual />}
                      </div>
                    ) : (
                      <span className="text-muted">abierto</span>
                    )}
                  </td>
                  <td className="max-w-[12rem] px-3 py-3 text-cream">
                    {t.nota ? (
                      <span className="line-clamp-2 text-xs">{t.nota}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-cream">
                    {d.horas != null ? d.horas.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-cream">
                    {d.subtotal > 0
                      ? new Intl.NumberFormat("es-AR", {
                          style: "currency",
                          currency: "ARS",
                          maximumFractionDigits: 0,
                        }).format(d.subtotal)
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <BorrarFichajeBtn
                      turnoId={t.id}
                      etiqueta={`turno del ${formatAR(t.entrada_at, "d 'de' MMMM")}`}
                    />
                  </td>
                </tr>
              );
            })}
            {turnos.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted">
                  Sin fichajes este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
