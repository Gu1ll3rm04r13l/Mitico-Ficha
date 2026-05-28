"use client";

import { useState } from "react";
import { SelfieDetailModal, type SelfieItem } from "./SelfieDetailModal";

// Datos para mostrar la ficha completa al abrir la miniatura (igual que la galería).
export interface SelfieDetalle {
  item: SelfieItem;
  nombreCompleto: string;
  rol: string | null;
}

// Miniatura de selfie clickeable. Si la foto fue archivada por rotación, placeholder.
// Con `detalle`, al tocarla abre el modal con ficha (empleado, fecha, tipo, nota).
export function SelfieThumb({
  url,
  hora,
  detalle,
}: {
  url: string | null;
  hora: string;
  detalle?: SelfieDetalle;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {url ? (
        <>
          <button onClick={() => setAbierto(true)} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="selfie"
              className="h-9 w-9 rounded-md object-cover ring-1 ring-muted/30"
            />
          </button>
          {detalle ? (
            <SelfieDetailModal
              item={abierto ? detalle.item : null}
              nombreCompleto={detalle.nombreCompleto}
              rol={detalle.rol}
              onClose={() => setAbierto(false)}
            />
          ) : (
            abierto && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                onClick={() => setAbierto(false)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="selfie"
                  className="max-h-[80dvh] max-w-full rounded-2xl"
                />
              </div>
            )
          )}
        </>
      ) : (
        <span
          title="Foto archivada por antigüedad"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-bg-deep text-xs text-muted ring-1 ring-muted/20"
        >
          —
        </span>
      )}
      <span className="text-cream">{hora}</span>
    </div>
  );
}
