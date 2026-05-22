"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

interface EmpListItem {
  id: string;
  nombre: string;
  apellido: string | null;
}

type Rol = "empleado" | "jefe";

export function LoginScreen({ empleados }: { empleados: EmpListItem[] }) {
  const router = useRouter();
  const [rol, setRol] = useState<Rol>("empleado");
  // Empleado
  const [empId, setEmpId] = useState<string>(empleados[0]?.id ?? "");
  const [pin, setPin] = useState("");
  // Jefe / staff
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  function cambiarRol(r: Rol) {
    setRol(r);
    setError(null);
  }

  async function loginEmpleado(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const res = await fetch("/api/empleado-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: empId, pin }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "No se pudo entrar");
      setCargando(false);
      return;
    }
    router.push("/mi-historial");
    router.refresh();
  }

  async function loginJefe(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) {
      setError("Email o contraseña incorrectos.");
      setCargando(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Selector de tipo de acceso */}
      <div
        role="tablist"
        aria-label="Tipo de acceso"
        className="flex rounded-lg bg-bg-card p-1"
      >
        <button
          role="tab"
          aria-selected={rol === "empleado"}
          onClick={() => cambiarRol("empleado")}
          className={`flex-1 cursor-pointer rounded-md py-2.5 text-sm transition-colors ${
            rol === "empleado" ? "bg-accent text-bg-deep" : "text-muted"
          }`}
        >
          Soy empleado
        </button>
        <button
          role="tab"
          aria-selected={rol === "jefe"}
          onClick={() => cambiarRol("jefe")}
          className={`flex-1 cursor-pointer rounded-md py-2.5 text-sm transition-colors ${
            rol === "jefe" ? "bg-accent text-bg-deep" : "text-muted"
          }`}
        >
          Soy jefe
        </button>
      </div>

      {rol === "empleado" ? (
        <form onSubmit={loginEmpleado} className="space-y-4">
          <Select
            label="Tu nombre"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
            required
          >
            {empleados.length === 0 && <option value="">Sin empleados</option>}
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} {e.apellido ?? ""}
              </option>
            ))}
          </Select>
          <Input
            label="PIN"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={cargando || !empId}
          >
            {cargando ? "Entrando…" : "Iniciar sesión"}
          </Button>
        </form>
      ) : (
        <form onSubmit={loginJefe} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={cargando}>
            {cargando ? "Entrando…" : "Entrar al panel"}
          </Button>
        </form>
      )}
    </div>
  );
}
