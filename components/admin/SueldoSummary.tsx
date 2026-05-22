"use client";

import { useState } from "react";
import { formatARS } from "@/lib/fichaje/sueldo";

// Footer de liquidación con toggle "Incluir extras" (default ON).
export function SueldoSummary({
  diasCompletos,
  totalBase,
  cantidadExtras,
  totalExtras,
}: {
  diasCompletos: number;
  totalBase: number;
  cantidadExtras: number;
  totalExtras: number;
}) {
  const [incluirExtras, setIncluirExtras] = useState(true);
  const total = totalBase + (incluirExtras ? totalExtras : 0);

  return (
    <div className="rounded-2xl bg-bg-card border border-muted/15 p-5">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Días completos: {diasCompletos}</span>
          <span className="text-cream">{formatARS(totalBase)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Extras: {cantidadExtras}</span>
          <span className="text-cream">{formatARS(totalExtras)}</span>
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-cream">
        <input
          type="checkbox"
          checked={incluirExtras}
          onChange={(e) => setIncluirExtras(e.target.checked)}
          className="h-4 w-4 accent-[#e8622a]"
        />
        Incluir extras en el total
      </label>

      <div className="mt-4 flex items-end justify-between border-t border-muted/15 pt-4">
        <span className="text-muted">Total a pagar</span>
        <span className="font-heading text-4xl text-accent">
          {formatARS(total)}
        </span>
      </div>
    </div>
  );
}
