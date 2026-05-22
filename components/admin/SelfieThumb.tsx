"use client";

import { useState } from "react";

// Miniatura de selfie clickeable. Si la foto fue archivada por rotación, placeholder.
export function SelfieThumb({
  url,
  hora,
}: {
  url: string | null;
  hora: string;
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
          {abierto && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
              onClick={() => setAbierto(false)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="selfie"
                className="max-h-[80vh] max-w-full rounded-2xl"
              />
            </div>
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
