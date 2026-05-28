import Link from "next/link";
import { listarEmpleados } from "@/lib/fichaje/admin";
import { Badge } from "@/components/ui/Card";
import { NuevoEmpleado } from "@/components/admin/NuevoEmpleado";

export const dynamic = "force-dynamic";

const MODALIDAD_LABEL: Record<string, string> = {
  jornada: "Jornada",
  horas: "Por hora",
  mixto: "Mixto",
};

export default async function EmpleadosPage() {
  const empleados = await listarEmpleados();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-4xl text-cream">Empleados</h1>
          <p className="mt-1 text-sm text-muted">
            Tocá (Click) un empleado para configurar su sueldo, ver sus fichajes
            y las fotos del mes.
          </p>
        </div>
        <div className="shrink-0">
          <NuevoEmpleado />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-muted/15">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-bg-card text-muted">
            <tr>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-left">Rol</th>
              <th className="px-4 py-3 text-left">Modalidad</th>
              <th className="px-4 py-3 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {empleados.map((e) => (
              <tr
                key={e.id}
                className="group border-t border-muted/10 transition-colors hover:bg-bg-card/60"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/empleados/${e.id}`}
                    className="flex items-center gap-2 font-medium text-cream group-hover:text-accent"
                  >
                    {/* Ícono "abrir" (cuadro + flecha diagonal): pista visual de que el nombre es clickeable */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-accent"
                      aria-hidden
                    >
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                    {e.nombre} {e.apellido ?? ""}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{e.rol ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {MODALIDAD_LABEL[e.modalidad_pago]}
                </td>
                <td className="px-4 py-3">
                  {e.activo ? (
                    <Badge>Activo</Badge>
                  ) : (
                    <span className="text-xs text-muted">Inactivo</span>
                  )}
                </td>
              </tr>
            ))}
            {empleados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No hay empleados. Creá el primero.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
