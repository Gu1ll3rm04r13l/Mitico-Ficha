"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PinPad } from "./PinPad";
import { TurnosTable } from "./TurnosTable";
import type { Turno } from "@/lib/fichaje/types";

type Paso = "pin" | "tabla" | "cargando";

function mesActualISO(): string {
  return new Date().toISOString().slice(0, 7);
}

export function FichajeFlow({
  empleadoId,
  nombre,
  tienePin,
}: {
  empleadoId: string;
  nombre: string;
  tienePin: boolean;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("pin");
  const [pin, setPin] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verificandoPin, setVerificandoPin] = useState(false);

  const cargarTurnos = useCallback(
    async (pinValidado: string) => {
      const res = await fetch("/api/mis-turnos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: empleadoId,
          pin: pinValidado,
          mes: mesActualISO(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "No se pudieron cargar los turnos");
      }
      const j = (await res.json()) as { turnos: Turno[] };
      setTurnos(j.turnos);
    },
    [empleadoId],
  );

  async function onPinSubmit(p: string) {
    setError(null);
    setVerificandoPin(true);
    try {
      if (!tienePin) {
        const res = await fetch("/api/set-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: empleadoId, pin: p }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "No se pudo guardar el PIN");
          return;
        }
      } else {
        const res = await fetch("/api/verificar-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_id: empleadoId, pin: p }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "PIN incorrecto");
          return;
        }
      }
      setPin(p);
      await cargarTurnos(p);
      setPaso("tabla");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión. Probá de nuevo.");
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

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-heading text-4xl text-cream">{nombre}</h1>
        <p className="text-muted">Tus turnos de este mes</p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-900/30 px-4 py-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <TurnosTable
        turnos={turnos}
        employeeId={empleadoId}
        pin={pin}
        onChanged={() => {
          cargarTurnos(pin).catch((e) =>
            setError(e instanceof Error ? e.message : "Error al refrescar"),
          );
        }}
      />

      <div className="text-center">
        <Button variant="secondary" onClick={() => router.push("/mi-historial")}>
          Ver mi historial
        </Button>
      </div>
    </div>
  );
}
