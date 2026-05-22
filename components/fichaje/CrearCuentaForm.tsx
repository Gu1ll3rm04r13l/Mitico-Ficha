"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function CrearCuentaForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const res = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, apellido: apellido || null, pin }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "No se pudo crear la cuenta");
      setCargando(false);
      return;
    }
    router.push("/mi-historial");
    router.refresh();
  }

  return (
    <form onSubmit={crear} className="space-y-4">
      <Input
        label="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />
      <Input
        label="Apellido (opcional)"
        value={apellido}
        onChange={(e) => setApellido(e.target.value)}
      />
      <Input
        label="Elegí un PIN (4 a 8 dígitos)"
        type="password"
        inputMode="numeric"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        required
      />
      <p className="text-xs text-muted">Te creás como empleado.</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={cargando}>
        {cargando ? "Creando…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
