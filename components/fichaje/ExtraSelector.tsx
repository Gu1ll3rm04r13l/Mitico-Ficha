"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ExtraModo } from "@/lib/fichaje/types";

const OPCIONES: { modo: ExtraModo; label: string }[] = [
  { modo: "cuarto", label: "1/4 día" },
  { modo: "medio", label: "1/2 día" },
  { modo: "completo", label: "Día completo" },
  { modo: "horas", label: "Por hora" },
];

const CHIPS = ["Amasado", "Cobertura", "Limpieza", "Otro"];

// Paso para modalidad mixto: elegir cómo se valúa el extra + nota rápida.
export function ExtraSelector({
  onElegir,
  onVolver,
}: {
  onElegir: (modo: ExtraModo, nota: string | null) => void;
  onVolver: () => void;
}) {
  const [modo, setModo] = useState<ExtraModo | null>(null);
  const [nota, setNota] = useState<string>("");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl text-cream">¿Cómo se cuenta?</h2>
        <p className="text-sm text-muted">Trabajo puntual (extra)</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {OPCIONES.map((o) => (
          <Button
            key={o.modo}
            variant={modo === o.modo ? "primary" : "secondary"}
            size="lg"
            onClick={() => setModo(o.modo)}
          >
            {o.label}
          </Button>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm text-muted">Nota (opcional)</p>
        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => setNota(c)}
              className={`rounded-full px-3 py-1 text-sm transition ${
                nota === c
                  ? "bg-accent-warm/30 text-accent-warm border border-accent-warm/50"
                  : "bg-bg-card text-muted border border-muted/20"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="ghost" size="lg" onClick={onVolver}>
          Volver
        </Button>
        <Button
          size="lg"
          className="flex-1"
          disabled={!modo}
          onClick={() => modo && onElegir(modo, nota || null)}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}
