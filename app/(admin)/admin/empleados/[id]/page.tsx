import { notFound } from "next/navigation";
import Link from "next/link";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import {
  getEmpleadoAdmin,
  getSalaryHistory,
  getFraccionesExtra,
} from "@/lib/fichaje/admin";
import { getFichajesMes, getParesMes, mesActual } from "@/lib/fichaje/historial";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularPeriodo } from "@/lib/fichaje/sueldo";
import { MesSelector } from "@/components/empleado/MesSelector";
import { ConfigSueldoForm } from "@/components/admin/ConfigSueldoForm";
import { EmpleadoAcciones } from "@/components/admin/EmpleadoAcciones";
import { SueldoSummary } from "@/components/admin/SueldoSummary";
import { Card, Badge } from "@/components/ui/Card";
import { SelfieThumb } from "@/components/admin/SelfieThumb";
import { BorrarFichajeBtn } from "@/components/admin/BorrarFichajeBtn";
import { SelfieGallery, type SelfieItem } from "@/components/admin/SelfieGallery";

export const dynamic = "force-dynamic";

// Marca para fichajes que el empleado cargó en otro momento: reloj + tooltip.
function BadgeTarde() {
  return (
    <span
      title="Fichaje Tardío (Fuera de horario)"
      aria-label="Fichaje Tardío (Fuera de horario)"
      className="inline-flex shrink-0 cursor-help items-center rounded-md bg-accent/20 px-1.5 py-0.5 text-xs text-accent"
    >
      ⏱
    </span>
  );
}

function tipoBadge(tipo: string, extraModo: string | null): string {
  if (tipo === "completa") return "Jornada";
  const map: Record<string, string> = {
    cuarto: "Extra 1/4",
    medio: "Extra 1/2",
    completo: "Extra día",
    horas: "Extra h",
  };
  return extraModo ? (map[extraModo] ?? "Extra") : "Extra";
}

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

  const [historial, fracciones, registros, pares] = await Promise.all([
    getSalaryHistory(id),
    getFraccionesExtra(),
    getFichajesMes(id, mes),
    getParesMes(id, mes),
  ]);

  // Firmar URLs de las selfies presentes (bucket privado).
  const paths = registros
    .map((r) => r.foto_path)
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

  const resumen = calcularPeriodo(pares, historial, {
    incluirExtras: true,
    fracciones,
  });

  // Items para la galería: registros del mes con foto firmada disponible.
  const galeria: SelfieItem[] = registros
    .filter((r) => r.foto_path && firmadas.has(r.foto_path))
    .map((r) => ({
      url: firmadas.get(r.foto_path as string) as string,
      timestamp: r.timestamp,
      tipo: r.tipo,
      tipoJornada: r.tipo_jornada,
      extraModo: r.extra_modo,
      nota: r.nota,
    }));

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
              <th className="px-3 py-3 text-right">Horas</th>
              <th className="px-3 py-3 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {resumen.dias.map((d, i) => {
              const par = pares[i]!;
              const ref = par.entrada ?? par.salida!; // siempre hay uno
              return (
                <tr key={i} className="border-t border-muted/10">
                  <td className="px-3 py-3 text-cream">
                    {formatAR(ref.timestamp, "EEE d")}
                  </td>
                  <td className="px-3 py-3">
                    <Badge>{tipoBadge(d.tipo, d.extraModo)}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    {par.entrada ? (
                      <div className="flex items-center gap-2">
                        <SelfieThumb
                          url={
                            par.entrada.foto_path
                              ? (firmadas.get(par.entrada.foto_path) ?? null)
                              : null
                          }
                          hora={horaAR(par.entrada.timestamp)}
                        />
                        {par.entrada.registrado_tarde && <BadgeTarde />}
                        <BorrarFichajeBtn
                          recordId={par.entrada.id}
                          etiqueta={`entrada de las ${horaAR(par.entrada.timestamp)}`}
                        />
                      </div>
                    ) : (
                      <span className="text-muted">falta</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {par.salida ? (
                      <div className="flex items-center gap-2">
                        <SelfieThumb
                          url={
                            par.salida.foto_path
                              ? (firmadas.get(par.salida.foto_path) ?? null)
                              : null
                          }
                          hora={horaAR(par.salida.timestamp)}
                        />
                        {par.salida.registrado_tarde && <BadgeTarde />}
                        <BorrarFichajeBtn
                          recordId={par.salida.id}
                          etiqueta={`salida de las ${horaAR(par.salida.timestamp)}`}
                        />
                      </div>
                    ) : (
                      <span className="text-muted">abierto</span>
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
                </tr>
              );
            })}
            {resumen.dias.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
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
