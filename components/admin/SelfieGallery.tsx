"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatAR } from "@/lib/fichaje/fechas";
import type { TipoFichaje, TipoJornada, ExtraModo } from "@/lib/fichaje/types";

export interface SelfieItem {
  url: string;
  timestamp: string;
  tipo: TipoFichaje;
  tipoJornada: TipoJornada;
  extraModo: ExtraModo | null;
  nota: string | null;
}

const EXTRA_LABEL: Record<ExtraModo, string> = {
  cuarto: "Extra 1/4",
  medio: "Extra 1/2",
  completo: "Extra día",
  horas: "Extra por horas",
};

function tipoTexto(item: SelfieItem): string {
  const accion = item.tipo === "entrada" ? "Entrada" : "Salida";
  const detalle =
    item.tipoJornada === "completa"
      ? "Jornada completa"
      : item.extraModo
        ? EXTRA_LABEL[item.extraModo]
        : "Extra";
  return `${accion} · ${detalle}`;
}

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

  useEffect(() => {
    if (sel === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowLeft") anterior();
      if (e.key === "ArrowRight") siguiente();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, items.length]);

  if (items.length === 0) {
    return (
      <p className="text-center text-muted">
        No hay fotos disponibles en este período.
      </p>
    );
  }

  const actual = sel !== null ? items[sel] : null;
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
              {formatAR(it.timestamp, "d MMM HH:mm")}
            </span>
            <span
              className={`absolute left-1 top-1 rounded px-1 text-[10px] font-semibold ${
                it.tipo === "entrada"
                  ? "bg-accent text-bg-deep"
                  : "bg-bg-deep/80 text-cream ring-1 ring-muted/40"
              }`}
            >
              {it.tipo === "entrada" ? "E" : "S"}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {actual && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cerrar}
          >
            <motion.div
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-bg-card md:flex-row"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative flex-1 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={actual.url}
                  alt="selfie"
                  className="h-full max-h-[60vh] w-full object-contain md:max-h-[90vh]"
                />
                <button
                  onClick={anterior}
                  aria-label="Anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-cream"
                >
                  ‹
                </button>
                <button
                  onClick={siguiente}
                  aria-label="Siguiente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-cream"
                >
                  ›
                </button>
              </div>

              <aside className="flex w-full flex-col gap-4 p-6 md:w-72">
                <button
                  onClick={cerrar}
                  aria-label="Cerrar"
                  className="self-end text-muted"
                >
                  ✕
                </button>
                <div>
                  <p className="text-xs uppercase text-muted">Empleado</p>
                  <p className="font-heading text-xl text-cream">
                    {nombreCompleto}
                  </p>
                  <p className="text-sm text-muted">{rol ?? "Sin puesto"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted">Fecha y hora</p>
                  <p className="text-cream">
                    {formatAR(actual.timestamp, "EEE d MMM, HH:mm")}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted">Tipo</p>
                  <p className="text-cream">{tipoTexto(actual)}</p>
                </div>
                {actual.nota && (
                  <div>
                    <p className="text-xs uppercase text-muted">Nota</p>
                    <p className="text-cream">{actual.nota}</p>
                  </div>
                )}
              </aside>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
