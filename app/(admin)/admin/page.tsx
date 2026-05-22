import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getKpisMes, getFraccionesExtra } from "@/lib/fichaje/admin";
import { getStaffSession } from "@/lib/fichaje/auth";
import { mesActual } from "@/lib/fichaje/historial";
import { Card } from "@/components/ui/Card";
import { FraccionesExtraForm } from "@/components/admin/FraccionesExtraForm";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const mes = mesActual();
  const [kpis, fracciones, session] = await Promise.all([
    getKpisMes(mes),
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-muted">Empleados activos</p>
          <p className="mt-1 font-heading text-5xl text-accent">
            {kpis.empleadosActivos}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Fichajes este mes</p>
          <p className="mt-1 font-heading text-5xl text-accent">
            {kpis.totalFichajes}
          </p>
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
