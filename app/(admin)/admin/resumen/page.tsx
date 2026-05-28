import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getResumenPagosMes } from "@/lib/fichaje/admin";
import { mesActual } from "@/lib/fichaje/historial";
import { formatARS } from "@/lib/fichaje/sueldo";
import { MesSelector } from "@/components/empleado/MesSelector";

export const dynamic = "force-dynamic";

export default async function ResumenPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const mes = mesParam ?? mesActual();
  const { filas, totalGeneral } = await getResumenPagosMes(mes);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted">
          ← Dashboard
        </Link>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-heading text-4xl text-cream">Resumen de pagos</h1>
            <p className="text-muted capitalize">
              {format(new Date(`${mes}-01`), "MMMM yyyy", { locale: es })}
            </p>
          </div>
          <MesSelector mes={mes} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-muted/15">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-bg-card text-muted">
            <tr>
              <th className="px-4 py-3 text-left">Empleado</th>
              <th className="px-4 py-3 text-right">Días</th>
              <th className="px-4 py-3 text-right">Extras</th>
              <th className="px-4 py-3 text-right">Base</th>
              <th className="px-4 py-3 text-right">Extras $</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.employeeId} className="border-t border-muted/10">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/empleados/${f.employeeId}?mes=${mes}`}
                    className="font-medium text-cream hover:text-accent"
                  >
                    {f.nombre} {f.apellido ?? ""}
                  </Link>
                  {f.rol && (
                    <span className="block text-xs text-muted">{f.rol}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-cream">
                  {f.diasCompletos}
                </td>
                <td className="px-4 py-3 text-right text-cream">
                  {f.cantidadExtras}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {f.totalBase > 0 ? formatARS(f.totalBase) : "—"}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {f.totalExtras > 0 ? formatARS(f.totalExtras) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-accent">
                  {f.total > 0 ? formatARS(f.total) : "—"}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No hay empleados.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-muted/20 bg-bg-card/60">
              <td className="px-4 py-3 font-semibold text-cream" colSpan={5}>
                Total a pagar del mes
              </td>
              <td className="px-4 py-3 text-right font-heading text-xl text-accent">
                {formatARS(totalGeneral)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
