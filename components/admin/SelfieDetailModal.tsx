"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatAR } from "@/lib/fichaje/fechas";
import type { TipoJornada, ExtraModo } from "@/lib/fichaje/types";

export interface SelfieItem {
  url: string;
  timestamp: string;
  marca: "entrada" | "salida";
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

export function tipoTexto(item: SelfieItem): string {
  const accion = item.marca === "entrada" ? "Entrada" : "Salida";
  const detalle =
    item.tipoJornada === "completa"
      ? "Jornada completa"
      : item.extraModo
        ? EXTRA_LABEL[item.extraModo]
        : "Extra";
  return `${accion} · ${detalle}`;
}

// Lightbox de selfie con ficha de datos (empleado, fecha, tipo, nota).
// Reutilizado por la galería del mes y por las miniaturas de la tabla.
// Las flechas ‹ › solo aparecen si se pasan onPrev/onNext (navegación de galería).
export function SelfieDetailModal({
  item,
  nombreCompleto,
  rol,
  onClose,
  onPrev,
  onNext,
}: {
  item: SelfieItem | null;
  nombreCompleto: string;
  rol: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose, onPrev, onNext]);

  // Descarga la foto. La URL es firmada (cross-origin), así que bajamos el blob
  // y forzamos la descarga; si falla, abrimos en otra pestaña como fallback.
  async function descargar(it: SelfieItem) {
    try {
      const res = await fetch(it.url);
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `selfie-${it.marca}-${it.timestamp.slice(0, 10)}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(u);
    } catch {
      window.open(it.url, "_blank");
    }
  }

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-bg-card md:flex-row"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex-1 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt="selfie"
                className="h-full max-h-[60dvh] w-full object-contain md:max-h-[90dvh]"
              />
              {onPrev && (
                <button
                  onClick={onPrev}
                  aria-label="Anterior"
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-cream"
                >
                  ‹
                </button>
              )}
              {onNext && (
                <button
                  onClick={onNext}
                  aria-label="Siguiente"
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-cream"
                >
                  ›
                </button>
              )}
            </div>

            <aside className="flex w-full flex-col gap-4 p-6 md:w-72">
              <div className="-mr-2 -mt-2 flex items-center justify-end gap-1">
                <button
                  onClick={() => descargar(item)}
                  aria-label="Descargar foto"
                  title="Descargar foto"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted transition hover:bg-bg-deep hover:text-cream"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted transition hover:bg-bg-deep hover:text-cream"
                >
                  ✕
                </button>
              </div>
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
                  {formatAR(item.timestamp, "dd/MM/yy, HH:mm")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted">Tipo</p>
                <p className="text-cream">{tipoTexto(item)}</p>
              </div>
              {item.nota && (
                <div>
                  <p className="text-xs uppercase text-muted">Nota</p>
                  <p className="text-cream">{item.nota}</p>
                </div>
              )}
            </aside>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
