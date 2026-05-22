"use client";

import { useState } from "react";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import { Button } from "@/components/ui/Button";
import { FichajeDialog } from "./FichajeDialog";
import type { ModalidadPago, Turno } from "@/lib/fichaje/types";

// Marca de fichaje cargado fuera del momento (hora a mano).
function BadgeManual() {
  return (
    <span
      title="Fichaje fuera de horario (hora cargada a mano)"
      aria-label="Fichaje fuera de horario"
      className="ml-1 inline-flex cursor-help items-center rounded-md bg-accent/20 px-1 py-0.5 text-[10px] text-accent"
    >
      ⏱
    </span>
  );
}

type Dialogo =
  | { tipo: "entrada" }
  | { tipo: "salida"; turnoId: string }
  | null;

export function TurnosTable({
  turnos,
  employeeId,
  pin,
  modalidad,
  onChanged,
}: {
  turnos: Turno[];
  employeeId: string;
  pin: string;
  modalidad: ModalidadPago;
  onChanged: () => void; // re-fetch en el padre tras un fichaje
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  function cerrarYRefrescar() {
    setDialogo(null);
    onChanged();
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-muted/15">
        <table className="w-full text-sm">
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
                  {formatAR(t.entrada_at, "EEE d MMM")}
                </td>
                <td className="px-3 py-3 text-cream">
                  {horaAR(t.entrada_at)}
                  {t.entrada_manual && <BadgeManual />}
                </td>
                <td className="px-3 py-3 text-cream">
                  {t.salida_at ? (
                    <>
                      {horaAR(t.salida_at)}
                      {t.salida_manual && <BadgeManual />}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDialogo({ tipo: "salida", turnoId: t.id })}
                      className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-bg-deep transition active:scale-95"
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
          modalidad={modalidad}
          mode={dialogo.tipo}
          turnoId={dialogo.tipo === "salida" ? dialogo.turnoId : undefined}
          onDone={cerrarYRefrescar}
          onCancel={() => setDialogo(null)}
        />
      )}
    </div>
  );
}
