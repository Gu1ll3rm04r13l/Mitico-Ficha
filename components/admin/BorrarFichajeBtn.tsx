"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarTurno } from "@/lib/fichaje/mutations";

// Borra un turno completo (entrada+salida) desde el panel admin.
export function BorrarFichajeBtn({
  turnoId,
  etiqueta,
}: {
  turnoId: string;
  etiqueta: string; // ej: "turno del 4 de mayo"
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();

  function borrar() {
    start(async () => {
      const r = await eliminarTurno(turnoId);
      setConfirmando(false);
      if (r.ok) router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        title={`Borrar ${etiqueta}`}
        aria-label={`Borrar ${etiqueta}`}
        className="text-muted transition hover:text-red-400"
      >
        ✕
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={borrar}
        disabled={pending}
        className="rounded bg-red-600 px-2 py-0.5 font-medium text-white disabled:opacity-50"
      >
        {pending ? "…" : "Borrar"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="text-muted hover:text-cream"
      >
        no
      </button>
    </span>
  );
}
