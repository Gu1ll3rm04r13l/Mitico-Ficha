"use client";

import { useState } from "react";

type Modo = "ingresar" | "crear";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const PIN_MIN = 4;
const PIN_MAX = 8;

export function PinPad({
  modo,
  nombre,
  cargando = false,
  error,
  onSubmit,
  onCancel,
}: {
  modo: Modo;
  nombre: string;
  cargando?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  // Solo se usa en modo "crear": guarda el primer PIN para confirmar.
  const [fase, setFase] = useState<"elegir" | "confirmar">("elegir");
  const [primero, setPrimero] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const enConfirmacion = modo === "crear" && fase === "confirmar";

  function titulo(): string {
    if (modo === "ingresar") return "Ingresá tu PIN";
    return enConfirmacion ? "Repetí tu PIN" : "Creá tu PIN";
  }

  function tocar(d: string) {
    setLocalError(null);
    if (pin.length >= PIN_MAX) return;
    setPin(pin + d);
  }

  function borrar() {
    setLocalError(null);
    setPin(pin.slice(0, -1));
  }

  function confirmar() {
    if (pin.length < PIN_MIN) {
      setLocalError(`El PIN debe tener al menos ${PIN_MIN} dígitos`);
      return;
    }
    if (modo === "ingresar") {
      onSubmit(pin);
      return;
    }
    // modo crear
    if (fase === "elegir") {
      setPrimero(pin);
      setPin("");
      setFase("confirmar");
      return;
    }
    // fase confirmar
    if (pin !== primero) {
      setLocalError("Los PIN no coinciden. Empezá de nuevo.");
      setPin("");
      setPrimero("");
      setFase("elegir");
      return;
    }
    onSubmit(pin);
  }

  const mostrado = error ?? localError;

  return (
    <div className="mx-auto flex max-w-xs flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="font-heading text-3xl text-cream">{nombre}</h1>
        <p
          className={
            modo === "crear"
              ? "font-heading text-2xl text-accent"
              : "text-muted"
          }
        >
          {titulo()}
        </p>
      </div>

      {/* Cartel destacado solo en alta de PIN (primera vez) */}
      {modo === "crear" && (
        <div className="w-full rounded-xl border border-accent/60 bg-accent/10 px-4 py-3 text-center text-sm text-cream">
          {enConfirmacion ? (
            <>
              <span className="font-semibold text-accent">Confirmá tu PIN.</span>{" "}
              Volvé a marcar los mismos dígitos para guardarlo.
            </>
          ) : (
            <>
              <span className="font-semibold text-accent">
                Primera vez acá.
              </span>{" "}
              Elegí un PIN de 4 a 8 dígitos. Este número queda{" "}
              <span className="font-semibold">creado como tuyo</span> y lo vas a
              usar siempre para fichar y ver tu historial.
            </>
          )}
        </div>
      )}

      {/* Indicador de dígitos */}
      <div className="flex gap-3" aria-hidden>
        {Array.from({ length: PIN_MAX }).map((_, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full transition ${
              i < pin.length ? "bg-accent" : "bg-muted/30"
            }`}
          />
        ))}
      </div>

      {mostrado && (
        <p className="text-center text-sm text-red-400">{mostrado}</p>
      )}

      {/* Teclado */}
      <div className="grid grid-cols-3 gap-3">
        {TECLAS.map((d) => (
          <button
            key={d}
            type="button"
            disabled={cargando}
            onClick={() => tocar(d)}
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-card text-2xl text-cream transition active:scale-95 hover:border hover:border-accent/60 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          disabled={cargando}
          onClick={borrar}
          aria-label="Borrar"
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-cream transition active:scale-95 disabled:opacity-50"
        >
          ←
        </button>
        <button
          type="button"
          disabled={cargando}
          onClick={() => tocar("0")}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-card text-2xl text-cream transition active:scale-95 hover:border hover:border-accent/60 disabled:opacity-50"
        >
          0
        </button>
        <button
          type="button"
          disabled={cargando || pin.length < PIN_MIN}
          onClick={confirmar}
          aria-label="Confirmar"
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-bg-deep transition active:scale-95 disabled:opacity-40"
        >
          ✓
        </button>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="text-sm text-muted underline"
      >
        Cancelar
      </button>
    </div>
  );
}
