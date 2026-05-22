"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { CameraCapture } from "@/components/fichaje/CameraCapture";
import type {
  ExtraModo,
  ModalidadPago,
  TipoFichaje,
  TipoJornada,
} from "@/lib/fichaje/types";

type Paso = "cerrado" | "form" | "camara" | "enviando";

function hoyISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// Opciones 00..N como strings de 2 dígitos.
const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

export function AgregarFichajeTardio({
  modalidad,
  chip = false,
  presetTipo,
  presetFecha,
  presetEnlaceId,
  presetSiblingTs,
}: {
  modalidad: ModalidadPago;
  chip?: boolean; // true = trigger pequeño "+ Fichar" para un hueco de la tabla
  presetTipo?: TipoFichaje; // si viene, el tipo queda fijo
  presetFecha?: string; // YYYY-MM-DD; si viene, el día queda fijo
  presetEnlaceId?: string; // id del fichaje hermano que se completa (hueco de la fila)
  presetSiblingTs?: string; // timestamp ISO del hermano, para validar el orden
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("cerrado");
  const [tipo, setTipo] = useState<TipoFichaje>(presetTipo ?? "salida");
  const [fecha, setFecha] = useState(presetFecha ?? hoyISO());
  const [hh, setHh] = useState("");
  const [mm, setMm] = useState("");
  const [tipoJornada, setTipoJornada] = useState<TipoJornada>("completa");
  const [extraModo, setExtraModo] = useState<ExtraModo>("medio");
  const [error, setError] = useState<string | null>(null);

  const tipoFijo = presetTipo != null;
  const fechaFija = presetFecha != null;
  const pedirJornada = modalidad === "mixto" && tipo === "entrada";
  const hora = hh !== "" && mm !== "" ? `${hh}:${mm}` : "";

  function abrir() {
    // Reset a los valores preset cada vez que se abre.
    setTipo(presetTipo ?? "salida");
    setFecha(presetFecha ?? hoyISO());
    setHh("");
    setMm("");
    setTipoJornada("completa");
    setExtraModo("medio");
    setError(null);
    setPaso("form");
  }

  function irACamara() {
    setError(null);
    if (!fecha || !hora) {
      setError("Completá la hora.");
      return;
    }
    const cuando = new Date(`${fecha}T${hora}`);
    if (isNaN(cuando.getTime())) {
      setError("Hora inválida.");
      return;
    }
    if (cuando.getTime() > Date.now() + 2 * 60_000) {
      setError("No podés cargar un fichaje en el futuro.");
      return;
    }
    // Si completa un hueco puntual, respetar el orden entrada → salida.
    if (presetSiblingTs) {
      const hermanoMs = new Date(presetSiblingTs).getTime();
      if (tipo === "salida" && cuando.getTime() < hermanoMs) {
        setError("La salida tiene que ser posterior a la entrada.");
        return;
      }
      if (tipo === "entrada" && cuando.getTime() > hermanoMs) {
        setError("La entrada tiene que ser anterior a la salida.");
        return;
      }
    }
    setPaso("camara");
  }

  async function enviar(foto: string) {
    setPaso("enviando");
    setError(null);
    const cuando = new Date(`${fecha}T${hora}`);
    const res = await fetch("/api/fichaje-tardio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: cuando.toISOString(),
        tipo,
        tipo_jornada: pedirJornada ? tipoJornada : "completa",
        extra_modo: pedirJornada && tipoJornada === "extra" ? extraModo : null,
        enlace_id: presetEnlaceId ?? null,
        foto_base64: foto,
      }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "No se pudo agregar el fichaje");
      setPaso("form");
      return;
    }
    setPaso("cerrado");
    router.refresh();
  }

  if (paso === "camara") {
    return <CameraCapture onCapture={enviar} onCancel={() => setPaso("form")} />;
  }

  // Trigger cerrado: chip pequeño o botón general.
  if (paso === "cerrado") {
    if (chip) {
      return (
        <button
          type="button"
          onClick={abrir}
          className="inline-flex items-center gap-1 rounded-lg border border-accent/40 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
        >
          + Fichar
        </button>
      );
    }
    return (
      <Button variant="secondary" size="sm" onClick={abrir}>
        + Agregar fichaje que olvidé
      </Button>
    );
  }

  // Form como modal overlay (funciona dentro de una celda de tabla).
  const fechaLabel = format(new Date(`${fecha}T00:00`), "EEEE d 'de' MMMM", {
    locale: es,
  });
  const esEntrada = tipo === "entrada";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-accent/40 bg-bg-card p-6">
        <h3 className="mb-1 font-heading text-2xl text-cream">
          Agregar fichaje olvidado
        </h3>
        <p className="mb-4 text-sm text-muted">
          Sumá un fichaje que no marcaste en su momento.
        </p>

        <div className="space-y-4">
          {/* Tipo: badge fijo o selector */}
          {tipoFijo ? null : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={tipo === "entrada" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setTipo("entrada")}
              >
                Entrada
              </Button>
              <Button
                variant={tipo === "salida" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setTipo("salida")}
              >
                Salida
              </Button>
            </div>
          )}

          {/* Resumen de contexto fijo (tipo + día) en un panel prolijo */}
          {(tipoFijo || fechaFija) && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-muted/20 bg-muted/5 text-sm">
              <div className="p-3">
                <span className="block text-xs uppercase tracking-wide text-muted">
                  Fichaje
                </span>
                <span
                  className={`mt-1 inline-flex items-center gap-1.5 font-semibold ${
                    esEntrada ? "text-emerald-400" : "text-accent"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      esEntrada ? "bg-emerald-400" : "bg-accent"
                    }`}
                  />
                  {esEntrada ? "Entrada" : "Salida"}
                </span>
              </div>
              <div className="border-l border-muted/20 p-3">
                <span className="block text-xs uppercase tracking-wide text-muted">
                  Día
                </span>
                <span className="mt-1 block font-semibold capitalize text-cream">
                  {fechaFija ? fechaLabel : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Día editable cuando no está fijo */}
          {!fechaFija && (
            <Input
              label="Día"
              type="date"
              value={fecha}
              max={hoyISO()}
              onChange={(e) => setFecha(e.target.value)}
            />
          )}

          {/* Hora en formato 24 h real (selectores propios, sin AM/PM) */}
          <div>
            <span className="mb-1 block text-sm text-muted">Hora</span>
            <div className="flex items-center gap-2">
              <Select
                aria-label="Hora"
                value={hh}
                onChange={(e) => setHh(e.target.value)}
                className="flex-1"
              >
                <option value="" disabled>
                  HH
                </option>
                {HORAS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
              <span className="text-xl font-semibold text-muted">:</span>
              <Select
                aria-label="Minutos"
                value={mm}
                onChange={(e) => setMm(e.target.value)}
                className="flex-1"
              >
                <option value="" disabled>
                  MM
                </option>
                {MINUTOS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <span className="mt-1 block text-xs text-muted">
              Formato 24 h (00 a 23)
            </span>
          </div>

          {pedirJornada && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-muted/15 p-3">
              <Select
                label="Tipo de jornada"
                value={tipoJornada}
                onChange={(e) => setTipoJornada(e.target.value as TipoJornada)}
              >
                <option value="completa">Jornada completa</option>
                <option value="extra">Extra (puntual)</option>
              </Select>
              {tipoJornada === "extra" && (
                <Select
                  label="Tipo de extra"
                  value={extraModo}
                  onChange={(e) => setExtraModo(e.target.value as ExtraModo)}
                >
                  <option value="cuarto">1/4 día</option>
                  <option value="medio">1/2 día</option>
                  <option value="completo">Día completo</option>
                  <option value="horas">Por hora</option>
                </Select>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setPaso("cerrado")}>
              Cancelar
            </Button>
            <Button size="sm" className="flex-1" onClick={irACamara}>
              Sacar selfie y guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
