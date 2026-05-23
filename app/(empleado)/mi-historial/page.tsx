import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import { verificarSesion, EMPLEADO_COOKIE } from "@/lib/fichaje/session";
import { getEmpleado } from "@/lib/fichaje/queries";
import { getTurnosMes, mesActual } from "@/lib/fichaje/historial";
import { MesSelector } from "@/components/empleado/MesSelector";
import { LogoutButton } from "@/components/empleado/LogoutButton";
import { VolverButton } from "@/components/empleado/VolverButton";
import { BadgeManual } from "@/components/fichaje/BadgeManual";

export const dynamic = "force-dynamic";

export default async function MiHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const cookieStore = await cookies();
  const empId = await verificarSesion(cookieStore.get(EMPLEADO_COOKIE)?.value);
  if (!empId) redirect("/login");

  const empleado = await getEmpleado(empId);
  if (!empleado) redirect("/login");

  const mes = mesParam ?? mesActual();
  const turnos = await getTurnosMes(empId, mes);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-cream">
            Hola, {empleado.nombre}
          </h1>
          <p className="text-sm text-muted">Tu historial de fichajes</p>
        </div>
        <div className="flex items-center gap-2">
          <VolverButton />
          <LogoutButton />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MesSelector mes={mes} />
      </div>

      {turnos.length === 0 ? (
        <p className="mt-8 text-center text-muted">
          No hay fichajes registrados este mes.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-muted/15">
          <table className="w-full text-sm">
            <thead className="bg-bg-card text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Entrada</th>
                <th className="px-4 py-3 text-left">Salida</th>
                <th className="px-4 py-3 text-right">Horas</th>
                <th className="px-4 py-3 text-left">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => {
                const horas = t.salida_at
                  ? (
                      (new Date(t.salida_at).getTime() -
                        new Date(t.entrada_at).getTime()) /
                      3_600_000
                    ).toFixed(1)
                  : "—";
                return (
                  <tr key={t.id} className="border-t border-muted/10">
                    <td className="px-4 py-3 text-cream">
                      {formatAR(t.entrada_at, "EEE d MMM")}
                    </td>
                    <td className="px-4 py-3 text-cream">
                      {horaAR(t.entrada_at)}
                      {t.entrada_manual && <BadgeManual />}
                    </td>
                    <td className="px-4 py-3 text-cream">
                      {t.salida_at ? (
                        <>
                          {horaAR(t.salida_at)}
                          {t.salida_manual && <BadgeManual />}
                        </>
                      ) : (
                        <span className="text-muted">abierto</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-cream">{horas}</td>
                    <td className="px-4 py-3">
                      <span className="text-muted">
                        {t.tipo_jornada === "completa"
                          ? "Jornada"
                          : `Extra${t.extra_modo ? " " + t.extra_modo : ""}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        Solo ves tus propios fichajes.
      </p>
    </main>
  );
}
