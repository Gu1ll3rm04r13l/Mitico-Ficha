# PIN al fichar + Galería de fotos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir PIN del empleado al fichar (creándolo en el primer fichaje si no tiene) y agregar una galería de selfies en la ficha del empleado para que el jefe revise las fotos del mes.

**Architecture:** El PIN se valida/crea server-side en `POST /api/fichar` (mismo `pin_hash` que usa el login de historial), con lockout en memoria. En el cliente, `FichajeFlow` arranca con un teclado numérico (`PinPad`) antes de elegir Entrada/Salida. La galería es una sección client (`SelfieGallery`) montada en la página server de detalle del empleado, reutilizando las URLs firmadas que la página ya calcula.

**Tech Stack:** Next.js 15 (App Router), React 18, TypeScript, Supabase (service role), zod, bcryptjs, framer-motion, date-fns, Tailwind v4.

**Notas de entorno:**
- No hay framework de tests. Cada tarea se verifica con `npm run typecheck` y `npm run lint`, más una prueba manual descrita.
- El proyecto **no es un repo git**. Donde un plan normal haría `git commit`, acá el cierre de tarea es: typecheck + lint OK. (Si más adelante se hace `git init`, se commitea por tarea.)
- Tradeoff aceptado de UX: en modo "ingresar", el PIN se valida recién en `/api/fichar` (después de la selfie). Si el PIN es incorrecto, el flujo vuelve al `PinPad` con error. Caso raro (PIN propio); se prioriza el alcance del spec.

---

## File Structure

**Nuevos:**
- `components/fichaje/PinPad.tsx` — teclado numérico reutilizable (modo ingresar/crear). Una sola responsabilidad: capturar un PIN válido y emitirlo.
- `components/admin/SelfieGallery.tsx` — grilla de selfies + modal de detalle con navegación. Solo presentación, recibe datos ya firmados.

**Modificados:**
- `app/api/cron/cleanup-photos/route.ts` — retención 50 → 55 días.
- `app/api/fichar/route.ts` — schema con `pin`, verificación/creación de PIN, lockout.
- `app/(publico)/fichar/[employeeId]/page.tsx` — derivar y pasar `tienePin`.
- `components/fichaje/FichajeFlow.tsx` — paso inicial `pin`, prop `tienePin`, enviar PIN.
- `app/(admin)/admin/empleados/[id]/page.tsx` — montar `SelfieGallery`.

---

## Task 1: Retención de fotos a 55 días

**Files:**
- Modify: `app/api/cron/cleanup-photos/route.ts:7-9`

- [ ] **Step 1: Cambiar la constante y el comentario**

En `app/api/cron/cleanup-photos/route.ts`, reemplazar:

```ts
// Rotación de fotos: borra selfies con más de 50 días, conserva el registro.
// Disparado por Vercel Cron (ver vercel.json) o manualmente con el header secreto.
const DIAS = 50;
```

por:

```ts
// Rotación de fotos: borra selfies con más de 55 días, conserva el registro.
// Disparado por Vercel Cron (ver vercel.json) o manualmente con el header secreto.
const DIAS = 55;
```

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores.

---

## Task 2: Validación/creación de PIN en `POST /api/fichar`

**Files:**
- Modify: `app/api/fichar/route.ts` (completo)

- [ ] **Step 1: Reescribir la cabecera de imports y el schema**

Reemplazar las líneas 1-17 actuales por:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarPin, hashPin, pinValido } from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Inserción de fichaje desde el celular del local. Sin login: usa service role.
// Pide PIN del empleado (lo crea en el primer fichaje si no tiene).
// Valida empleado activo, verifica PIN, sube la selfie al bucket privado, inserta el registro.

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
  tipo: z.enum(["entrada", "salida"]),
  tipo_jornada: z.enum(["completa", "extra"]).default("completa"),
  extra_modo: z.enum(["cuarto", "medio", "completo", "horas"]).nullable().optional(),
  nota: z.string().max(200).nullable().optional(),
  foto_base64: z.string().min(100), // dataURL jpeg
});

// Lockout de PIN en memoria: 5 intentos fallidos → 5 min de bloqueo por empleado.
const intentosPin = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

// Rate limit de fichaje en memoria: 1 fichaje por empleado cada 60s.
const ultimoPorEmpleado = new Map<string, number>();
const RATE_MS = 60_000;
```

- [ ] **Step 2: Actualizar el bloque de validación de empleado para traer `pin_hash`**

Reemplazar el bloque actual de "Empleado activo?" (que selecciona `"id, activo, modalidad_pago"`) por uno que también traiga `pin_hash`:

```ts
  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  // Empleado activo?
  const { data: emp, error: empErr } = await db
    .from("employees")
    .select("id, activo, modalidad_pago, pin_hash")
    .eq("id", input.employee_id)
    .maybeSingle();
  if (empErr) {
    return NextResponse.json({ error: "error de base" }, { status: 500 });
  }
  if (!emp || !emp.activo) {
    return NextResponse.json(
      { error: "empleado inexistente o inactivo" },
      { status: 404 },
    );
  }
```

- [ ] **Step 3: Insertar el bloque de PIN (lockout → verificar/crear) justo después de validar empleado**

Agregar inmediatamente después del bloque del Step 2, antes del rate limit de fichaje:

```ts
  // Lockout de PIN
  const estadoPin = intentosPin.get(input.employee_id);
  if (estadoPin && estadoPin.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos de PIN. Probá en unos minutos." },
      { status: 429 },
    );
  }

  if (emp.pin_hash) {
    // Empleado con PIN: verificar
    const ok = await verificarPin(input.pin, emp.pin_hash);
    if (!ok) {
      const fails = (estadoPin?.fails ?? 0) + 1;
      intentosPin.set(input.employee_id, {
        fails,
        hasta: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
      });
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    }
    intentosPin.delete(input.employee_id);
  } else {
    // Empleado sin PIN: crearlo en este primer fichaje
    if (!pinValido(input.pin)) {
      return NextResponse.json(
        { error: "El PIN debe tener 4 a 8 dígitos" },
        { status: 400 },
      );
    }
    const nuevoHash = await hashPin(input.pin);
    const { error: pinErr } = await db
      .from("employees")
      .update({ pin_hash: nuevoHash })
      .eq("id", input.employee_id);
    if (pinErr) {
      return NextResponse.json(
        { error: "no se pudo guardar el PIN" },
        { status: 500 },
      );
    }
  }
```

- [ ] **Step 4: Mover el rate limit de fichaje a DESPUÉS del bloque de PIN**

El rate limit de fichaje (60s) debe quedar después de validar el PIN, para no consumir el cupo en intentos fallidos. Asegurar que este bloque esté inmediatamente después del bloque de PIN (Step 3) y eliminar cualquier chequeo de rate limit que haya quedado antes:

```ts
  // Rate limit de fichaje (después de validar PIN)
  const ahora = Date.now();
  const ultimo = ultimoPorEmpleado.get(input.employee_id) ?? 0;
  if (ahora - ultimo < RATE_MS) {
    return NextResponse.json(
      { error: "Esperá unos segundos antes de fichar de nuevo." },
      { status: 429 },
    );
  }
```

Nota: `const ahora = Date.now();` se define acá. El resto de la ruta (resolver `tipo_jornada`/`extra_modo`, subir foto usando `ahora`, insertar registro, `ultimoPorEmpleado.set(input.employee_id, ahora)` al final) queda **igual** que antes.

- [ ] **Step 5: Verificar typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores. En particular, confirmar que `ahora` se usa una sola vez (no duplicado) y que no quedó el `const ahora`/rate-limit viejo al principio del handler.

- [ ] **Step 6: Prueba manual (smoke) del endpoint**

Run: `npm run dev` y en otra terminal probar un POST inválido para confirmar el schema:

```bash
curl -s -X POST http://localhost:3000/api/fichar -H "Content-Type: application/json" -d "{}"
```

Expected: status 400 con `{"error":"datos inválidos",...}` (ahora exige `pin` además de los otros campos).

---

## Task 3: Pasar `tienePin` a `FichajeFlow` desde la página

**Files:**
- Modify: `app/(publico)/fichar/[employeeId]/page.tsx:28-33`

- [ ] **Step 1: Agregar la prop `tienePin` al render de `FichajeFlow`**

`getEmpleado` ya devuelve el `Employee` completo (incluye `pin_hash`) server-side. Derivar el booleano y pasarlo (NUNCA pasar el hash). Reemplazar el bloque del `<FichajeFlow ... />` por:

```tsx
      <FichajeFlow
        empleadoId={empleado.id}
        nombre={empleado.nombre}
        modalidad={empleado.modalidad_pago}
        sugerencia={sugerencia}
        tienePin={!!empleado.pin_hash}
      />
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: fallará en este punto con un error de prop `tienePin` desconocida en `FichajeFlow` (todavía no existe). Eso es esperado; se resuelve en Task 4. Si preferís evitar el rojo intermedio, hacé Task 4 antes de correr el typecheck.

---

## Task 4: Componente `PinPad` (teclado numérico)

**Files:**
- Create: `components/fichaje/PinPad.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
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
        <p className="text-muted">{titulo()}</p>
      </div>

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
```

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores en `PinPad.tsx` (puede seguir el error de Task 3 si `FichajeFlow` aún no acepta `tienePin`; se resuelve en Task 5).

---

## Task 5: Integrar `PinPad` en `FichajeFlow` y enviar el PIN

**Files:**
- Modify: `components/fichaje/FichajeFlow.tsx`

- [ ] **Step 1: Importar `PinPad` y ampliar tipos/props/estado**

Agregar el import junto a los otros de `./`:

```tsx
import { PinPad } from "./PinPad";
```

Cambiar el tipo `Paso` para incluir `"pin"`:

```tsx
type Paso = "pin" | "accion" | "jornada" | "extra" | "camara" | "enviando" | "exito";
```

Agregar `tienePin` a las props del componente (en el objeto desestructurado y en su tipo):

```tsx
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
```

Cambiar el estado inicial del paso a `"pin"` y agregar estado para el PIN:

```tsx
  const [paso, setPaso] = useState<Paso>("pin");
  const [pin, setPin] = useState("");
```

- [ ] **Step 2: Enviar el PIN en el POST y manejar PIN incorrecto**

En la función `enviar`, agregar `pin` al body y, ante 401, volver al paso `pin` con el error. Reemplazar el cuerpo de `enviar` por:

```tsx
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
      setTimeout(() => router.push("/fichar"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setPaso("accion");
    }
  }
```

- [ ] **Step 3: Renderizar el `PinPad` cuando `paso === "pin"`**

Agregar este bloque de render ANTES del `if (paso === "camara")`:

```tsx
  if (paso === "pin") {
    return (
      <PinPad
        modo={tienePin ? "ingresar" : "crear"}
        nombre={nombre}
        error={error}
        onCancel={() => router.push("/fichar")}
        onSubmit={(p) => {
          setPin(p);
          setError(null);
          setPaso("accion");
        }}
      />
    );
  }
```

- [ ] **Step 4: Verificar typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores (se resuelve también el error pendiente de Task 3).

- [ ] **Step 5: Prueba manual del flujo completo**

Run: `npm run dev`. Con al menos un empleado cargado en Supabase:
1. Ir a `/fichar`, tocar un nombre.
2. Empleado **sin** PIN: debe pedir "Creá tu PIN" + "Repetí tu PIN"; al coincidir avanza a Entrada/Salida → selfie → ✓. Verificar en Supabase que `employees.pin_hash` quedó seteado.
3. Empleado **con** PIN: debe pedir "Ingresá tu PIN". Con PIN correcto avanza; con PIN incorrecto, tras la selfie vuelve al teclado con "PIN incorrecto".

---

## Task 6: Componente `SelfieGallery`

**Files:**
- Create: `components/admin/SelfieGallery.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { TipoFichaje, TipoJornada, ExtraModo } from "@/lib/fichaje/types";

export interface SelfieItem {
  url: string;
  timestamp: string;
  tipo: TipoFichaje;
  tipoJornada: TipoJornada;
  extraModo: ExtraModo | null;
  nota: string | null;
}

const EXTRA_LABEL: Record<ExtraModo, string> = {
  cuarto: "Extra 1/4",
  medio: "Extra 1/2",
  completo: "Extra día",
  horas: "Extra por horas",
};

function tipoTexto(item: SelfieItem): string {
  const accion = item.tipo === "entrada" ? "Entrada" : "Salida";
  const detalle =
    item.tipoJornada === "completa"
      ? "Jornada completa"
      : item.extraModo
        ? EXTRA_LABEL[item.extraModo]
        : "Extra";
  return `${accion} · ${detalle}`;
}

export function SelfieGallery({
  items,
  nombre,
  apellido,
  rol,
}: {
  items: SelfieItem[];
  nombre: string;
  apellido: string | null;
  rol: string | null;
}) {
  const [sel, setSel] = useState<number | null>(null);

  const cerrar = () => setSel(null);
  const anterior = () =>
    setSel((i) => (i === null ? i : (i - 1 + items.length) % items.length));
  const siguiente = () =>
    setSel((i) => (i === null ? i : (i + 1) % items.length));

  useEffect(() => {
    if (sel === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowLeft") anterior();
      if (e.key === "ArrowRight") siguiente();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, items.length]);

  if (items.length === 0) {
    return (
      <p className="text-center text-muted">
        No hay fotos disponibles en este período.
      </p>
    );
  }

  const actual = sel !== null ? items[sel] : null;
  const nombreCompleto = `${nombre} ${apellido ?? ""}`.trim();

  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {items.map((it, i) => (
          <button
            key={`${it.timestamp}-${i}`}
            onClick={() => setSel(i)}
            className="group relative aspect-square overflow-hidden rounded-xl ring-1 ring-muted/20"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.url}
              alt="selfie"
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-center text-[11px] text-cream">
              {format(new Date(it.timestamp), "d MMM HH:mm", { locale: es })}
            </span>
            <span
              className={`absolute left-1 top-1 rounded px-1 text-[10px] font-semibold ${
                it.tipo === "entrada"
                  ? "bg-accent text-bg-deep"
                  : "bg-bg-deep/80 text-cream ring-1 ring-muted/40"
              }`}
            >
              {it.tipo === "entrada" ? "E" : "S"}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {actual && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cerrar}
          >
            <motion.div
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-bg-card md:flex-row"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative flex-1 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={actual.url}
                  alt="selfie"
                  className="h-full max-h-[60vh] w-full object-contain md:max-h-[90vh]"
                />
                <button
                  onClick={anterior}
                  aria-label="Anterior"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-cream"
                >
                  ‹
                </button>
                <button
                  onClick={siguiente}
                  aria-label="Siguiente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-cream"
                >
                  ›
                </button>
              </div>

              <aside className="flex w-full flex-col gap-4 p-6 md:w-72">
                <button
                  onClick={cerrar}
                  aria-label="Cerrar"
                  className="self-end text-muted"
                >
                  ✕
                </button>
                <div>
                  <p className="text-xs uppercase text-muted">Empleado</p>
                  <p className="font-heading text-xl text-cream">
                    {nombreCompleto}
                  </p>
                  <p className="text-sm text-muted">{rol ?? "Sin puesto"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted">Fecha y hora</p>
                  <p className="text-cream">
                    {format(new Date(actual.timestamp), "EEE d MMM, HH:mm", {
                      locale: es,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted">Tipo</p>
                  <p className="text-cream">{tipoTexto(actual)}</p>
                </div>
                {actual.nota && (
                  <div>
                    <p className="text-xs uppercase text-muted">Nota</p>
                    <p className="text-cream">{actual.nota}</p>
                  </div>
                )}
              </aside>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Verificar typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores.

---

## Task 7: Montar `SelfieGallery` en la ficha del empleado

**Files:**
- Modify: `app/(admin)/admin/empleados/[id]/page.tsx`

- [ ] **Step 1: Importar el componente y su tipo**

Agregar junto a los imports de componentes admin:

```tsx
import { SelfieGallery, type SelfieItem } from "@/components/admin/SelfieGallery";
```

- [ ] **Step 2: Construir los items de la galería desde `registros` + `firmadas`**

Después de calcular `resumen` (y antes del `return`), agregar:

```tsx
  // Items para la galería: registros del mes con foto firmada disponible.
  const galeria: SelfieItem[] = registros
    .filter((r) => r.foto_path && firmadas.has(r.foto_path))
    .map((r) => ({
      url: firmadas.get(r.foto_path as string) as string,
      timestamp: r.timestamp,
      tipo: r.tipo,
      tipoJornada: r.tipo_jornada,
      extraModo: r.extra_modo,
      nota: r.nota,
    }));
```

- [ ] **Step 3: Renderizar la sección "Fotos del mes" después de `SueldoSummary`**

Justo antes del cierre `</div>` del contenedor principal (después del `<SueldoSummary ... />`), agregar:

```tsx
      <section className="space-y-4">
        <h2 className="font-heading text-2xl text-cream">Fotos del mes</h2>
        <SelfieGallery
          items={galeria}
          nombre={empleado.nombre}
          apellido={empleado.apellido}
          rol={empleado.rol}
        />
      </section>
```

- [ ] **Step 4: Verificar typecheck + lint**

Run: `npm run typecheck` y `npm run lint`
Expected: sin errores. Confirmar que los nombres de campo de `registros` coinciden (`timestamp`, `tipo`, `tipo_jornada`, `extra_modo`, `nota`, `foto_path`) con `TimeRecord`.

- [ ] **Step 5: Prueba manual de la galería**

Run: `npm run dev`, entrar como staff (`/login`), ir a `/admin/empleados/[id]` de un empleado con fichajes del mes:
1. Ver la grilla "Fotos del mes" con miniaturas (badge E/S + fecha/hora).
2. Click en una foto → modal animado, imagen grande + panel con empleado/puesto, fecha y hora, tipo, y nota si existe.
3. Navegar con flechas ‹ › y teclas izquierda/derecha; cerrar con Esc, ✕ o click en el fondo.

---

## Self-Review (completado al escribir el plan)

- **Cobertura del spec:** PIN obligatorio al fichar (Task 2, 5) ✓; PIN creado en primer fichaje (Task 2) ✓; PIN al inicio del flujo (Task 5) ✓; validación server-side + lockout (Task 2) ✓; `tienePin` sin exponer hash (Task 3) ✓; retención 55 días (Task 1) ✓; galería como sección en ficha (Task 7) ✓; modal animado con imagen + detalles (empleado+puesto, fecha/hora, tipo, nota) y navegación (Task 6) ✓; tabla y `SelfieThumb` sin cambios ✓.
- **Placeholders:** ninguno; todo el código está completo.
- **Consistencia de tipos:** `SelfieItem` definido en Task 6 y consumido idéntico en Task 7 (`url, timestamp, tipo, tipoJornada, extraModo, nota`). Props de `FichajeFlow` (`tienePin`) coherentes entre Task 3 y Task 5. Campos de `Employee`/`TimeRecord` verificados contra `lib/fichaje/types.ts`.
