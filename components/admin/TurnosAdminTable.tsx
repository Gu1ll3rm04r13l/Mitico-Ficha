"use client";

import { useState } from "react";
import type { TipoJornada, ExtraModo } from "@/lib/fichaje/types";
import { SelfieThumb, type SelfieDetalle } from "./SelfieThumb";
import { BadgeManual } from "@/components/fichaje/BadgeManual";
import { TipoTurnoEditor } from "./TipoTurnoEditor";
import { BorrarFichajeBtn } from "./BorrarFichajeBtn";

// Datos ya preparados en el server para cada fila (todo serializable).
export interface FilaTurno {
  id: string;
  fechaTxt: string; // DD/MM/AA
  tipoJornada: TipoJornada;
  extraModo: ExtraModo | null;
  entradaHora: string;
  entradaUrl: string | null;
  entradaManual: boolean;
  entradaDetalle?: SelfieDetalle;
  salidaAbierto: boolean;
  salidaHora: string;
  salidaUrl: string | null;
  salidaManual: boolean;
  salidaDetalle?: SelfieDetalle;
  nota: string | null;
  horasTxt: string;
  subtotalTxt: string;
  borrarEtiqueta: string;
}

// Botón flechas: "›‹" colapsa, "‹›" expande.
function ToggleCol({
  colapsado,
  onToggle,
  label,
}: {
  colapsado: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${colapsado ? "Expandir" : "Colapsar"} columna ${label}`}
      title={`${colapsado ? "Expandir" : "Colapsar"} ${label}`}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-bg-deep hover:text-cream"
    >
      <span className="text-base leading-none">{colapsado ? "‹›" : "›‹"}</span>
    </button>
  );
}

export function TurnosAdminTable({ filas }: { filas: FilaTurno[] }) {
  const [tipoCol, setTipoCol] = useState(false);
  const [notaCol, setNotaCol] = useState(false);

  return (
    <div className="overflow-x-auto rounded-2xl border border-muted/15">
      <table className="w-full min-w-[48rem] text-sm">
        <thead className="bg-bg-card text-muted">
          <tr>
            <th className="px-3 py-3 text-left">Fecha</th>
            <th className="px-3 py-3 text-left">
              {tipoCol ? (
                <ToggleCol colapsado onToggle={() => setTipoCol(false)} label="Tipo" />
              ) : (
                <span className="inline-flex items-center gap-1">
                  Tipo
                  <ToggleCol colapsado={false} onToggle={() => setTipoCol(true)} label="Tipo" />
                </span>
              )}
            </th>
            <th className="px-3 py-3 text-left">Entrada</th>
            <th className="px-3 py-3 text-left">Salida</th>
            <th className="px-3 py-3 text-left">
              {notaCol ? (
                <ToggleCol colapsado onToggle={() => setNotaCol(false)} label="Notas" />
              ) : (
                <span className="inline-flex items-center gap-1">
                  Notas
                  <ToggleCol colapsado={false} onToggle={() => setNotaCol(true)} label="Notas" />
                </span>
              )}
            </th>
            <th className="px-3 py-3 text-right">Horas</th>
            <th className="px-3 py-3 text-right">Subtotal</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className="border-t border-muted/10">
              <td className="px-3 py-3 text-cream">{f.fechaTxt}</td>

              <td className="px-3 py-3">
                {tipoCol ? (
                  <span className="text-muted">·</span>
                ) : (
                  <TipoTurnoEditor
                    turnoId={f.id}
                    tipoInicial={f.tipoJornada}
                    extraInicial={f.extraModo}
                  />
                )}
              </td>

              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <SelfieThumb
                    url={f.entradaUrl}
                    hora={f.entradaHora}
                    detalle={f.entradaDetalle}
                  />
                  {f.entradaManual && <BadgeManual />}
                </div>
              </td>

              <td className="px-3 py-3">
                {f.salidaAbierto ? (
                  <span className="text-muted">abierto</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <SelfieThumb
                      url={f.salidaUrl}
                      hora={f.salidaHora}
                      detalle={f.salidaDetalle}
                    />
                    {f.salidaManual && <BadgeManual />}
                  </div>
                )}
              </td>

              <td className="max-w-[12rem] px-3 py-3 text-cream">
                {notaCol ? (
                  <span className="text-muted">·</span>
                ) : f.nota ? (
                  <span className="line-clamp-2 text-xs">{f.nota}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>

              <td className="px-3 py-3 text-right text-cream">{f.horasTxt}</td>
              <td className="px-3 py-3 text-right text-cream">{f.subtotalTxt}</td>
              <td className="px-3 py-3 text-right">
                <BorrarFichajeBtn turnoId={f.id} etiqueta={f.borrarEtiqueta} />
              </td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-muted">
                Sin fichajes este mes.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
