"use client";

import { useState } from "react";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import { Button } from "@/components/ui/Button";
import { FichajeDialog } from "./FichajeDialog";
import { BadgeManual } from "./BadgeManual";
import type { Turno } from "@/lib/fichaje/types";

type Dialogo =
  | { tipo: "entrada" }
  | { tipo: "salida"; turnoId: string }
  | null;

export function TurnosTable({
  turnos,
  employeeId,
  pin,
  onChanged,
}: {
  turnos: Turno[];
  employeeId: string;
  pin: string;
  onChanged: () => void; // re-fetch en el padre tras un fichaje
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  function cerrarYRefrescar() {
    setDialogo(null);
    onChanged();
  }

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-2xl border border-muted/15">
        <table className="w-full min-w-[22rem] text-sm">
          <thead className="bg-bg-card text-muted">
            <tr>
              <th className="px-3 py-3 text-left">Día</th>
              <th className="px-3 py-3 text-left">Entrada</th>
              <th className="px-3 py-3 text-left">Salida</th>
              <th className="px-3 py-3 text-left">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {turnos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  Todavía no fichaste este mes.
                </td>
              </tr>
            )}
            {turnos.map((t) => (
              <tr key={t.id} className="border-t border-muted/10">
                <td className="px-3 py-3 text-cream">
                  {formatAR(t.entrada_at, "dd/MM/yy")}
                </td>
                <td className="px-3 py-3 text-cream">
                  {horaAR(t.entrada_at)}
                  {t.entrada_manual && <BadgeManual size="xs" />}
                </td>
                <td className="px-3 py-3 text-cream">
                  {t.salida_at ? (
                    <>
                      {horaAR(t.salida_at)}
                      {t.salida_manual && <BadgeManual size="xs" />}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDialogo({ tipo: "salida", turnoId: t.id })}
                      className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg-deep transition active:scale-95"
                    >
                      Fichar
                    </button>
                  )}
                </td>
                <td className="px-3 py-3 text-muted">
                  {t.tipo_jornada === "completa"
                    ? "Jornada"
                    : `Extra${t.extra_modo ? " " + t.extra_modo : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button size="xl" className="w-full" onClick={() => setDialogo({ tipo: "entrada" })}>
        Fichar Nueva Entrada
      </Button>

      {dialogo && (
        <FichajeDialog
          employeeId={employeeId}
          pin={pin}
          mode={dialogo.tipo}
          turnoId={dialogo.tipo === "salida" ? dialogo.turnoId : undefined}
          onDone={cerrarYRefrescar}
          onCancel={() => setDialogo(null)}
        />
      )}
    </div>
  );
}
