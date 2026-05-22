"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarFichaje } from "@/lib/fichaje/mutations";

// Borra un fichaje individual (entrada o salida) desde el panel admin.
export function BorrarFichajeBtn({
  recordId,
  etiqueta,
}: {
  recordId: string;
  etiqueta: string; // ej: "entrada de las 11:05"
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();

  function borrar() {
    start(async () => {
      const r = await eliminarFichaje(recordId);
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
