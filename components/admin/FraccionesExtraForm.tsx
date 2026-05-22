"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { guardarFraccionesExtra } from "@/lib/fichaje/mutations";
import type { ExtraFracciones } from "@/lib/fichaje/types";

export function FraccionesExtraForm({
  fracciones,
}: {
  fracciones: ExtraFracciones;
}) {
  const [cuarto, setCuarto] = useState(String(fracciones.cuarto));
  const [medio, setMedio] = useState(String(fracciones.medio));
  const [completo, setCompleto] = useState(String(fracciones.completo));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function guardar() {
    setMsg(null);
    start(async () => {
      const r = await guardarFraccionesExtra(
        Number(cuarto),
        Number(medio),
        Number(completo),
      );
      setMsg(r.ok ? "Guardado" : (r.error ?? "Error"));
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Input
          label="1/4 día"
          type="number"
          step="0.05"
          value={cuarto}
          onChange={(e) => setCuarto(e.target.value)}
        />
        <Input
          label="1/2 día"
          type="number"
          step="0.05"
          value={medio}
          onChange={(e) => setMedio(e.target.value)}
        />
        <Input
          label="Día completo"
          type="number"
          step="0.05"
          value={completo}
          onChange={(e) => setCompleto(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={guardar} disabled={pending}>
          {pending ? "Guardando…" : "Guardar fracciones"}
        </Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
