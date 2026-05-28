"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { guardarConfigSueldo } from "@/lib/fichaje/mutations";
import { formatARS } from "@/lib/fichaje/sueldo";
import type { Employee } from "@/lib/fichaje/types";

export function ConfigSueldoForm({ empleado }: { empleado: Employee }) {
  const router = useRouter();
  const [modalidad, setModalidad] = useState(empleado.modalidad_pago);
  const [sueldoMensual, setSueldoMensual] = useState(
    empleado.sueldo_mensual?.toString() ?? "",
  );
  const [horasJornada, setHorasJornada] = useState(
    empleado.horas_jornada_estandar?.toString() ?? "8",
  );
  const [diarioOverride, setDiarioOverride] = useState(
    empleado.sueldo_diario_override?.toString() ?? "",
  );
  const [horaOverride, setHoraOverride] = useState(
    empleado.tarifa_hora_override?.toString() ?? "",
  );
  const [vigenteDesde, setVigenteDesde] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [avanzado, setAvanzado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const { tarifaDiaria, tarifaHoraria } = useMemo(() => {
    const mensual = Number(sueldoMensual) || 0;
    const horas = Number(horasJornada) || 8;
    const diaria = Number(diarioOverride) || mensual / 30;
    const horaria = Number(horaOverride) || (horas > 0 ? diaria / horas : 0);
    return { tarifaDiaria: diaria, tarifaHoraria: horaria };
  }, [sueldoMensual, horasJornada, diarioOverride, horaOverride]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg(null);
    start(async () => {
      const r = await guardarConfigSueldo(empleado.id, fd);
      setMsg(r.ok ? "Guardado ✓" : (r.error ?? "Error"));
      if (r.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Select
        name="modalidad"
        label="Modalidad de pago"
        value={modalidad}
        onChange={(e) => setModalidad(e.target.value as Employee["modalidad_pago"])}
      >
        <option value="jornada">Jornada completa</option>
        <option value="horas">Por hora</option>
        <option value="mixto">Mixto</option>
      </Select>

      <div>
        <Input
          name="sueldo_mensual"
          label="Sueldo mensual"
          type="number"
          step="0.01"
          value={sueldoMensual}
          onChange={(e) => setSueldoMensual(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted">
          Tarifa diaria: {formatARS(tarifaDiaria)} (mensual ÷ 30) · Tarifa horaria:{" "}
          {formatARS(tarifaHoraria)} (diaria ÷ {horasJornada || 8}h)
        </p>
      </div>

      <div>
        <Input
          name="vigente_desde"
          label="Vigente desde"
          type="date"
          value={vigenteDesde}
          onChange={(e) => setVigenteDesde(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted">
          Desde qué día aplica este sueldo. Para recalcular todo el mes en curso,
          poné el día 1. Los días anteriores a esta fecha mantienen el sueldo previo.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setAvanzado((v) => !v)}
        className="text-sm text-accent-warm"
      >
        {avanzado ? "− Ocultar" : "+ Overrides avanzados"}
      </button>

      {avanzado && (
        <div className="space-y-3 rounded-xl border border-muted/15 p-4">
          <div className="rounded-lg border border-accent-warm/30 bg-accent-warm/10 p-3 text-xs leading-relaxed text-cream/90">
            <p className="mb-1 font-semibold text-accent-warm">ℹ INFO — ¿qué es esto?</p>
            <p>
              Normalmente la <strong>tarifa diaria</strong> sale del sueldo mensual ÷ 30, y
              la <strong>tarifa por hora</strong> sale de esa diaria ÷ horas de jornada. Estos
              campos sirven para <strong>forzar a mano</strong> esos valores cuando el cálculo
              automático no aplica:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                <strong>Diario manual:</strong> fija lo que vale un día completo, ignorando
                el ÷30 (ej: pagás $20.000 el día sin importar el mensual).
              </li>
              <li>
                <strong>Hora manual:</strong> fija el valor de la hora para los extras por
                hora, ignorando el cálculo desde la diaria.
              </li>
              <li>
                <strong>Horas jornada:</strong> cuántas horas dura una jornada completa
                (base para calcular la tarifa horaria). Default 8.
              </li>
            </ul>
            <p className="mt-1 text-muted">
              Dejá los manuales en blanco para usar el cálculo automático.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
          <Input
            name="sueldo_diario_override"
            label="Diario manual"
            type="number"
            step="0.01"
            value={diarioOverride}
            onChange={(e) => setDiarioOverride(e.target.value)}
          />
          <Input
            name="tarifa_hora_override"
            label="Hora manual"
            type="number"
            step="0.01"
            value={horaOverride}
            onChange={(e) => setHoraOverride(e.target.value)}
          />
          <Input
            name="horas_jornada_estandar"
            label="Horas jornada"
            type="number"
            step="0.5"
            value={horasJornada}
            onChange={(e) => setHorasJornada(e.target.value)}
          />
          </div>
        </div>
      )}
      {!avanzado && (
        <input
          type="hidden"
          name="horas_jornada_estandar"
          value={horasJornada}
        />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar configuración"}
        </Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </form>
  );
}
