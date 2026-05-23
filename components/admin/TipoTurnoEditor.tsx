"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarTipoTurno } from "@/lib/fichaje/mutations";
import type { ExtraModo, TipoJornada } from "@/lib/fichaje/types";

// Editor inline del TIPO de un turno (Jornada / Extra) desde el panel admin.
// Guarda al cambiar; si es Extra pide además la fracción.
export function TipoTurnoEditor({
  turnoId,
  tipoInicial,
  extraInicial,
}: {
  turnoId: string;
  tipoInicial: TipoJornada;
  extraInicial: ExtraModo | null;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoJornada>(tipoInicial);
  const [extra, setExtra] = useState<ExtraModo>(extraInicial ?? "medio");
  const [estado, setEstado] = useState<"idle" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  function guardar(nuevoTipo: TipoJornada, nuevoExtra: ExtraModo) {
    setEstado("idle");
    start(async () => {
      const r = await cambiarTipoTurno(
        turnoId,
        nuevoTipo,
        nuevoTipo === "extra" ? nuevoExtra : null,
      );
      setEstado(r.ok ? "ok" : "error");
      if (r.ok) router.refresh();
    });
  }

  const selectCls =
    "rounded-lg border border-muted/30 bg-bg-deep px-2 py-1 text-xs text-cream focus:border-accent focus:outline-none";

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Tipo de turno"
        value={tipo}
        disabled={pending}
        className={selectCls}
        onChange={(e) => {
          const t = e.target.value as TipoJornada;
          setTipo(t);
          guardar(t, extra);
        }}
      >
        <option value="completa">Jornada</option>
        <option value="extra">Extra</option>
      </select>

      {tipo === "extra" && (
        <select
          aria-label="Tipo de extra"
          value={extra}
          disabled={pending}
          className={selectCls}
          onChange={(e) => {
            const x = e.target.value as ExtraModo;
            setExtra(x);
            guardar("extra", x);
          }}
        >
          <option value="cuarto">1/4</option>
          <option value="medio">1/2</option>
          <option value="completo">día</option>
          <option value="horas">x hora</option>
        </select>
      )}

      {pending && <span className="text-xs text-muted">…</span>}
      {!pending && estado === "ok" && (
        <span className="text-xs text-accent-warm">✓</span>
      )}
      {!pending && estado === "error" && (
        <span className="text-xs text-red-400">✕</span>
      )}
    </div>
  );
}
