"use client";

import { useState } from "react";
import { formatAR } from "@/lib/fichaje/fechas";
import { SelfieDetailModal, type SelfieItem } from "./SelfieDetailModal";

// Re-export para no romper imports existentes (page.tsx importa SelfieItem desde acá).
export type { SelfieItem };

export function SelfieGallery({
  items,
  nombre,
  apellido,
  rol,
}: {
  items: SelfieItem[];
  nombre: string;
  apellido: string | null;
  rol: string | null;
}) {
  const [sel, setSel] = useState<number | null>(null);

  const cerrar = () => setSel(null);
  const anterior = () =>
    setSel((i) => (i === null ? i : (i - 1 + items.length) % items.length));
  const siguiente = () =>
    setSel((i) => (i === null ? i : (i + 1) % items.length));

  if (items.length === 0) {
    return (
      <p className="text-center text-muted">
        No hay fotos disponibles en este período.
      </p>
    );
  }

  const actual = sel !== null ? items[sel]! : null;
  const nombreCompleto = `${nombre} ${apellido ?? ""}`.trim();

  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {items.map((it, i) => (
          <button
            key={`${it.timestamp}-${i}`}
            onClick={() => setSel(i)}
            className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-muted/20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.url}
              alt="selfie"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[11px] text-cream">
              {formatAR(it.timestamp, "dd/MM/yy HH:mm")}
            </span>
            <span
              className={`absolute left-1 top-1 rounded px-1 text-[10px] font-semibold ${
                it.marca === "entrada"
                  ? "bg-accent text-bg-deep"
                  : "bg-bg-deep/80 text-cream ring-1 ring-muted/40"
              }`}
            >
              {it.marca === "entrada" ? "E" : "S"}
            </span>
          </button>
        ))}
      </div>

      <SelfieDetailModal
        item={actual}
        nombreCompleto={nombreCompleto}
        rol={rol}
        onClose={cerrar}
        onPrev={anterior}
        onNext={siguiente}
      />
    </>
  );
}
