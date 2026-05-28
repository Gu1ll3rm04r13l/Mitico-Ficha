import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getDashboardResumen, getFraccionesExtra } from "@/lib/fichaje/admin";
import { getStaffSession } from "@/lib/fichaje/auth";
import { mesActual } from "@/lib/fichaje/historial";
import { horaAR } from "@/lib/fichaje/fechas";
import { formatARS } from "@/lib/fichaje/sueldo";
import { Card } from "@/components/ui/Card";
import { FraccionesExtraForm } from "@/components/admin/FraccionesExtraForm";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const mes = mesActual();
  const [resumen, fracciones, session] = await Promise.all([
    getDashboardResumen(mes),
    getFraccionesExtra(),
    getStaffSession(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-4xl text-cream">Dashboard</h1>
        <p className="text-muted capitalize">
          {format(new Date(`${mes}-01`), "MMMM yyyy", { locale: es })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-muted">Empleados activos</p>
          <p className="mt-1 font-heading text-5xl text-accent">
            {resumen.empleadosActivos}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-muted">Total a pagar del mes</p>
          <p className="mt-1 font-heading text-5xl text-accent">
            {formatARS(resumen.totalPagarMes)}
          </p>
          <p className="mt-1 text-xs text-muted">Estimado (base + extras)</p>
          <Link
            href="/admin/resumen"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-warm hover:text-accent"
          >
            Ver detalle por empleado →
          </Link>
        </Card>

        <Card>
          <p className="text-sm text-muted">Fichados ahora</p>
          <p className="mt-1 font-heading text-5xl text-accent">
            {resumen.fichadosAhora.length}
          </p>
          {resumen.fichadosAhora.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {resumen.fichadosAhora.map((f) => (
                <li
                  key={f.employeeId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-cream">{f.nombre}</span>
                  <span className="text-muted">desde {horaAR(f.entradaAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Nadie fichado en este momento.</p>
          )}
        </Card>
      </div>

      <div className="flex gap-3">
        <Link
          href="/admin/empleados"
          className="rounded-xl bg-accent px-5 py-3 font-semibold text-bg-deep"
        >
          Gestionar empleados →
        </Link>
      </div>

      {session?.rol === "admin" && (
        <Card>
          <h2 className="mb-1 font-heading text-2xl text-cream">
            Fracciones del EXTRA
          </h2>
          <p className="mb-4 text-sm text-muted">
            Cuánto vale cada tipo de extra respecto al día completo. Editable.
          </p>
          <FraccionesExtraForm fracciones={fracciones} />
        </Card>
      )}
    </div>
  );
}
