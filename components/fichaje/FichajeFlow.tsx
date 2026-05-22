"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CameraCapture } from "./CameraCapture";
import { ExtraSelector } from "./ExtraSelector";
import { PinPad } from "./PinPad";
import type {
  ExtraModo,
  ModalidadPago,
  TipoFichaje,
  TipoJornada,
} from "@/lib/fichaje/types";

type Paso = "pin" | "accion" | "jornada" | "extra" | "camara" | "enviando" | "exito";

export function FichajeFlow({
  empleadoId,
  nombre,
  modalidad,
  sugerencia,
  tienePin,
}: {
  empleadoId: string;
  nombre: string;
  modalidad: ModalidadPago;
  sugerencia: TipoFichaje; // botón primario sugerido
  tienePin: boolean;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("pin");
  const [pin, setPin] = useState("");
  const [tipo, setTipo] = useState<TipoFichaje>("entrada");
  const [tipoJornada, setTipoJornada] = useState<TipoJornada>("completa");
  const [extraModo, setExtraModo] = useState<ExtraModo | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificandoPin, setVerificandoPin] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Decide si hay que preguntar jornada/extra (solo entrada + mixto).
  function elegirAccion(t: TipoFichaje) {
    setTipo(t);
    setError(null);
    if (t === "entrada" && modalidad === "mixto") {
      setPaso("jornada");
    } else {
      // jornada/horas o salida → directo a cámara (server resuelve el resto)
      setTipoJornada("completa");
      setExtraModo(null);
      setPaso("camara");
    }
  }

  async function enviar(fotoBase64: string) {
    setPaso("enviando");
    setError(null);
    try {
      const res = await fetch("/api/fichar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: empleadoId,
          pin,
          tipo,
          tipo_jornada: tipoJornada,
          extra_modo: extraModo,
          nota,
          foto_base64: fotoBase64,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        // PIN incorrecto / bloqueado → volver al teclado
        if (res.status === 401 || res.status === 429) {
          setError(j.error ?? "PIN incorrecto");
          setPin("");
          setPaso("pin");
          return;
        }
        throw new Error(j.error ?? "No se pudo registrar el fichaje");
      }
      setPaso("exito");
      redirectTimer.current = setTimeout(() => router.push("/fichar"), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setPaso("accion");
    }
  }

  async function onPinSubmit(p: string) {
    setPin(p);
    setError(null);
    setVerificandoPin(true);
    try {
      if (!tienePin) {
        // Primera vez (sin PIN): crearlo ya, sin esperar a la selfie.
        const res = await fetch("/api/set-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: empleadoId, pin: p }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "No se pudo guardar el PIN");
          setPin("");
          return;
        }
      } else {
        // Verificar PIN antes de abrir la cámara: falla rápido si está mal.
        const res = await fetch("/api/verificar-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: empleadoId, pin: p }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "PIN incorrecto");
          setPin("");
          return;
        }
      }
      setPaso("accion");
    } catch {
      setError("Error de conexión. Probá de nuevo.");
      setPin("");
    } finally {
      setVerificandoPin(false);
    }
  }

  if (paso === "pin") {
    return (
      <PinPad
        modo={tienePin ? "ingresar" : "crear"}
        nombre={nombre}
        error={error}
        cargando={verificandoPin}
        onCancel={() => router.push("/fichar")}
        onSubmit={onPinSubmit}
      />
    );
  }

  if (paso === "camara") {
    return (
      <CameraCapture onCapture={enviar} onCancel={() => setPaso("accion")} />
    );
  }

  if (paso === "enviando") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted/30 border-t-accent" />
        <p className="text-muted">Registrando…</p>
      </div>
    );
  }

  if (paso === "exito") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent text-bg-deep">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M20 6L9 17l-5-5"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="font-heading text-3xl text-cream">
          {tipo === "entrada" ? "¡Entrada registrada!" : "¡Salida registrada!"}
        </h2>
        <p className="text-muted">{nombre}</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            if (redirectTimer.current) clearTimeout(redirectTimer.current);
            router.push("/mi-historial");
          }}
        >
          Ver mi historial
        </Button>
      </div>
    );
  }

  if (paso === "jornada") {
    return (
      <div className="space-y-6">
        <h2 className="font-heading text-2xl text-cream">¿Qué hacés hoy?</h2>
        <div className="grid gap-3">
          <Button
            size="xl"
            onClick={() => {
              setTipoJornada("completa");
              setExtraModo(null);
              setPaso("camara");
            }}
          >
            Jornada completa
          </Button>
          <Button
            size="xl"
            variant="secondary"
            onClick={() => {
              setTipoJornada("extra");
              setPaso("extra");
            }}
          >
            Extra (puntual)
          </Button>
        </div>
        <Button variant="ghost" onClick={() => setPaso("accion")}>
          Volver
        </Button>
      </div>
    );
  }

  if (paso === "extra") {
    return (
      <ExtraSelector
        onVolver={() => setPaso("jornada")}
        onElegir={(modo, n) => {
          setExtraModo(modo);
          setNota(n);
          setPaso("camara");
        }}
      />
    );
  }

  // paso "accion"
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-heading text-4xl text-cream">{nombre}</h1>
        <p className="text-muted">¿Qué querés fichar?</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-900/30 px-4 py-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-4">
        <Button
          size="xl"
          variant={sugerencia === "entrada" ? "primary" : "secondary"}
          className={sugerencia === "entrada" ? "min-h-[96px]" : ""}
          onClick={() => elegirAccion("entrada")}
        >
          Fichar Entrada
        </Button>
        <Button
          size="xl"
          variant={sugerencia === "salida" ? "primary" : "secondary"}
          className={sugerencia === "salida" ? "min-h-[96px]" : ""}
          onClick={() => elegirAccion("salida")}
        >
          Fichar Salida
        </Button>
      </div>
    </div>
  );
}
