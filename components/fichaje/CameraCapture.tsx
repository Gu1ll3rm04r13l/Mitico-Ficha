"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

// Captura selfie con cámara frontal. Devuelve dataURL jpeg al confirmar.
// onSkip (opcional) habilita un botón "Fichar sin foto" SOLO en la pantalla de
// error de cámara, para no demorar el fichaje si la cámara no arranca.
export function CameraCapture({
  onCapture,
  onCancel,
  onSkip,
}: {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
  onSkip?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setError("No se pudo acceder a la cámara. Revisá los permisos.");
      }
    })();
    return () => {
      cancelado = true;
      detener();
    };
  }, [detener]);

  function capturar() {
    const video = videoRef.current;
    if (!video) return;
    const lado = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // recorte cuadrado centrado + espejo (selfie)
    const sx = (video.videoWidth - lado) / 2;
    const sy = (video.videoHeight - lado) / 2;
    ctx.translate(lado, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, lado, lado, 0, 0, lado, lado);
    setPreview(canvas.toDataURL("image/jpeg", 0.8));
    detener();
  }

  async function reintentar() {
    setPreview(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setError("No se pudo reabrir la cámara.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-deep">
      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center text-cream">
            <p className="max-w-sm text-balance">{error}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" size="lg" onClick={onCancel}>
                Volver
              </Button>
              {onSkip && (
                <Button size="lg" onClick={onSkip}>
                  Fichar sin foto
                </Button>
              )}
            </div>
            {onSkip && (
              <p className="max-w-sm text-xs text-muted">
                Si la cámara no arranca, fichá igual. Queda registrado sin selfie
                y el admin lo va a ver.
              </p>
            )}
          </div>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="preview" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover [transform:scaleX(-1)]"
          />
        )}
      </div>

      <div className="flex items-center justify-around gap-4 p-6">
        {preview ? (
          <>
            <Button variant="secondary" size="lg" onClick={reintentar}>
              Repetir
            </Button>
            <Button size="lg" onClick={() => onCapture(preview)}>
              Confirmar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="lg" onClick={onCancel}>
              Cancelar
            </Button>
            <button
              onClick={capturar}
              disabled={!!error}
              aria-label="Sacar foto"
              className="h-20 w-20 rounded-full border-4 border-accent bg-cream active:scale-95 transition disabled:opacity-40"
            />
            <div className="w-[88px]" />
          </>
        )}
      </div>
    </div>
  );
}
