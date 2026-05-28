"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { CameraCapture } from "@/components/fichaje/CameraCapture";
import { formatAR } from "@/lib/fichaje/fechas";

type Paso = "form" | "camara" | "enviando";

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function hoyISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// Reloj en vivo (hora del local, AR) que corre segundo a segundo. Se muestra
// cuando se ficha con "Hora actual" para que se vea el instante exacto.
function RelojVivo() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="rounded-xl border border-accent/20 bg-bg-deep px-4 py-3 text-center">
      <span className="block text-xs text-muted">Se registrará a esta hora</span>
      <span className="font-heading text-3xl tabular-nums text-cream">
        {formatAR(ahora, "HH:mm:ss")}
      </span>
    </div>
  );
}

// Diálogo unificado de fichaje. Sirve para abrir entrada (mode="entrada") y para
// cerrar un turno (mode="salida"). Por defecto usa "Hora actual" (now()); el
// empleado puede elegir hora/día a mano (queda marcado manual=true). El tipo de
// jornada NO se elige acá: lo ajusta el admin desde el panel si hace falta.
export function FichajeDialog({
  employeeId,
  pin,
  mode,
  turnoId,
  onDone,
  onCancel,
}: {
  employeeId: string;
  pin: string;
  mode: "entrada" | "salida";
  turnoId?: string; // requerido si mode==="salida"
  onDone: () => void;
  onCancel: () => void;
}) {
  const [paso, setPaso] = useState<Paso>("form");
  const [horaActual, setHoraActual] = useState(true);
  const [fecha, setFecha] = useState(hoyISO());
  const [hh, setHh] = useState("");
  const [mm, setMm] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Arma el instante a fichar: now() o el elegido a mano (en hora local del cel).
  function calcularAt(): { at: string; manual: boolean } | null {
    if (horaActual) return { at: new Date().toISOString(), manual: false };
    if (!fecha || hh === "" || mm === "") {
      setError("Elegí hora y minutos, o usá Hora actual.");
      return null;
    }
    const cuando = new Date(`${fecha}T${hh}:${mm}`);
    if (isNaN(cuando.getTime())) {
      setError("Hora inválida.");
      return null;
    }
    if (cuando.getTime() > Date.now() + 2 * 60_000) {
      setError("No podés fichar en el futuro.");
      return null;
    }
    return { at: cuando.toISOString(), manual: true };
  }

  function irACamara() {
    setError(null);
    if (calcularAt() === null) return;
    setPaso("camara");
  }

  // foto = null cuando el empleado eligió "Fichar sin foto" en el error de cámara.
  async function enviar(foto: string | null) {
    const armado = calcularAt();
    if (!armado) {
      setPaso("form");
      return;
    }
    setPaso("enviando");
    setError(null);

    const notaLimpia = nota.trim() || null;
    const url = mode === "entrada" ? "/api/turno" : `/api/turno/${turnoId}/salida`;
    const base = {
      pin,
      nota: notaLimpia,
      at: armado.at,
      manual: armado.manual,
      ...(foto ? { foto_base64: foto } : {}),
    };
    const body =
      mode === "entrada"
        ? { employee_id: employeeId, ...base }
        : base;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "No se pudo registrar el fichaje");
      setPaso("form");
      return;
    }
    onDone();
  }

  if (paso === "camara") {
    return (
      <CameraCapture
        onCapture={enviar}
        onCancel={() => setPaso("form")}
        onSkip={() => enviar(null)}
      />
    );
  }

  if (paso === "enviando") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted/30 border-t-accent" />
        <p className="text-muted">Registrando…</p>
      </div>
    );
  }

  const fechaLabel = format(new Date(`${fecha}T00:00`), "EEEE d 'de' MMMM", {
    locale: es,
  });
  const esEntrada = mode === "entrada";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-accent/40 bg-bg-card p-6">
        <h3 className="mb-1 font-heading text-2xl text-cream">
          {esEntrada ? "Fichar entrada" : "Fichar salida"}
        </h3>
        <p className="mb-4 text-sm text-muted">
          Por defecto se usa la hora actual. Cambiala solo si fichás fuera de horario.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={horaActual ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                setHoraActual(true);
                setError(null);
              }}
            >
              Hora actual
            </Button>
            <Button
              variant={!horaActual ? "primary" : "secondary"}
              size="sm"
              onClick={() => {
                setHoraActual(false);
                setError(null);
              }}
            >
              Elegir hora
            </Button>
          </div>

          {horaActual && <RelojVivo />}

          {!horaActual && (
            <>
              <Input
                label="Día"
                type="date"
                value={fecha}
                max={hoyISO()}
                onChange={(e) => setFecha(e.target.value)}
              />
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
                  {fechaLabel} · formato 24 h (00 a 23)
                </span>
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-sm text-muted" htmlFor="nota">
              Notas (opcional)
            </label>
            <textarea
              id="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Ej: amasado + biga, cambio de aceite…"
              className="w-full rounded-lg border border-muted/30 bg-bg-card px-3 py-2 text-cream placeholder:text-muted/60 transition focus:border-accent focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <Button variant="ghost" size="sm" onClick={onCancel}>
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
