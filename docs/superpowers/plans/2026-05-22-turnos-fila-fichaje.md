# Fichaje por turno-fila — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el modelo de fichaje (1 fila por evento + emparejado entrada/salida por heurística) por un modelo turno-fila (1 fila = 1 turno con entrada y salida), eliminando toda la lógica de emparejado.

**Architecture:** Nueva tabla `fichaje.turnos`. El empleado, tras el PIN, ve la tabla de sus turnos del mes; cierra un turno abierto con un botón `Fichar` en su fila y abre uno nuevo con `Fichar Nueva Entrada`. Cada marca (entrada/salida) lleva selfie y un timestamp que por defecto es "ahora" (botón "Hora actual") o elegido a mano. La liquidación lee filas directo (sin emparejar).

**Tech Stack:** Next 15 (App Router, route handlers `runtime=nodejs`), Supabase (schema `fichaje`, service client), TypeScript estricto, Zod, bcryptjs, date-fns-tz. Tests de lógica con `tsx` + `node:assert`.

**Spec:** `docs/superpowers/specs/2026-05-22-turnos-fila-fichaje-design.md`

---

## Estructura de archivos

**Crear:**
- `supabase/migrations/0006_turnos.sql` — drop time_records, create turnos + RLS.
- `app/api/turno/route.ts` — POST nueva entrada (abre turno).
- `app/api/turno/[id]/salida/route.ts` — POST cierra turno (salida).
- `app/api/mis-turnos/route.ts` — POST lista turnos del mes con fotos re-firmadas.
- `components/fichaje/FichajeDialog.tsx` — diálogo unificado (hora actual + manual + selfie).
- `components/fichaje/TurnosTable.tsx` — tabla de turnos post-PIN con botones de fichaje.
- `scripts/test-sueldo.ts` — tests de `calcularPeriodo`.

**Modificar:**
- `lib/fichaje/types.ts` — agregar `Turno`, borrar `TimeRecord` y `TipoFichaje`.
- `lib/fichaje/sueldo.ts` — `calcularPeriodo` sobre `Turno[]`; borrar `emparejarFichajes`, `MAX_TURNO_HORAS`, `ParFichaje`.
- `lib/fichaje/historial.ts` — `getTurnosMes`; borrar `getParesMes`, `getFichajesMes`.
- `lib/fichaje/queries.ts` — borrar `getUltimoFichajeHoy` y el import de `TimeRecord`.
- `lib/fichaje/mutations.ts` — `eliminarFichaje`→`eliminarTurno`; adaptar `eliminarEmpleado`.
- `components/admin/BorrarFichajeBtn.tsx` — pasar `turnoId`, llamar `eliminarTurno`.
- `components/admin/SelfieGallery.tsx` — `SelfieItem.marca` en vez de `tipo: TipoFichaje`.
- `app/(publico)/fichar/[employeeId]/page.tsx` — sin `sugerencia`.
- `app/(empleado)/mi-historial/page.tsx` — solo lectura sobre `turnos`.
- `app/(admin)/admin/empleados/[id]/page.tsx` — sobre `turnos`.
- `app/api/cron/cleanup-photos/route.ts` — limpia entrada+salida.
- `scripts/seed-casos-prueba.mjs` — inserta filas `turnos`.
- `package.json` — devDep `tsx` + script `test`.

**Borrar:**
- `app/api/fichar/route.ts`
- `app/api/fichaje-tardio/route.ts`
- `components/empleado/AgregarFichajeTardio.tsx`
- `components/fichaje/FichajeFlow.tsx` se reescribe completo (no se borra).

---

## Task 1: Migración 0006 — tabla `turnos`

**Files:**
- Create: `supabase/migrations/0006_turnos.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- =====================================================================
-- Fichero Mítico — 0006 modelo turno-fila
-- Reemplaza time_records (1 fila/evento + emparejado) por turnos
-- (1 fila = 1 turno con entrada y salida). La data previa es de prueba:
-- drop + create, sin migrar datos. Las migraciones 0004/0005 quedan
-- obsoletas (alteraban la tabla que acá se dropea) pero no se borran.
-- =====================================================================

drop table if exists fichaje.time_records cascade;
drop type if exists fichaje.tipo_fichaje;

create table fichaje.turnos (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references fichaje.employees(id) on delete cascade,

  tipo_jornada    fichaje.tipo_jornada not null default 'completa',
  extra_modo      fichaje.extra_modo,
  nota            text,

  -- La fila SIEMPRE nace con entrada (no existe salida huérfana).
  entrada_at         timestamptz not null,
  entrada_foto_url   text,
  entrada_foto_path  text,
  entrada_manual     boolean not null default false,  -- true = hora elegida a mano

  -- salida_at null = turno abierto.
  salida_at          timestamptz,
  salida_foto_url    text,
  salida_foto_path   text,
  salida_manual      boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index turnos_emp_entrada_idx on fichaje.turnos (employee_id, entrada_at desc);
create index turnos_abiertos_idx    on fichaje.turnos (employee_id) where salida_at is null;

-- RLS equivalente a la de time_records (helpers ya existen en 0002).
alter table fichaje.turnos enable row level security;

create policy turnos_staff_all on fichaje.turnos
  for all to authenticated
  using (fichaje.es_staff()) with check (fichaje.es_staff());

create policy turnos_self_select on fichaje.turnos
  for select to authenticated
  using (
    exists (
      select 1 from fichaje.employees e
      where e.id = turnos.employee_id and e.user_id = auth.uid()
    )
  );

-- El alta/cierre de turnos desde el celular NO pasa por RLS: las route handlers
-- usan service role. (Igual que time_records antes.)

create trigger turnos_set_updated_at
  before update on fichaje.turnos
  for each row execute function fichaje.set_updated_at();
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Aplicar vía el MCP de Supabase (proyecto `Mitico`, ref `ltusdzhggabmbilrjuju`) con `apply_migration` name `0006_turnos`, o por el SQL editor del dashboard. Pegar el contenido del archivo.

Esperado: sin error. `time_records` deja de existir; `turnos` existe.

- [ ] **Step 3: Verificar el schema**

Listar tablas del schema `fichaje` (MCP `list_tables` o `\dt fichaje.*`).
Esperado: aparece `fichaje.turnos`, no aparece `fichaje.time_records`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_turnos.sql
git commit -m "feat(db): migración 0006 modelo turno-fila

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Tipos — `Turno`

**Files:**
- Modify: `lib/fichaje/types.ts`

- [ ] **Step 1: Borrar `TipoFichaje` y `TimeRecord`, agregar `Turno`**

En `lib/fichaje/types.ts`, borrar la línea:
```ts
export type TipoFichaje = "entrada" | "salida";
```
y borrar la interface `TimeRecord` completa (líneas 38-51). Agregar en su lugar:

```ts
export interface Turno {
  id: string;
  employee_id: string;
  tipo_jornada: TipoJornada;
  extra_modo: ExtraModo | null;
  nota: string | null;
  entrada_at: string;
  entrada_foto_url: string | null;
  entrada_foto_path: string | null;
  entrada_manual: boolean;
  salida_at: string | null;
  salida_foto_url: string | null;
  salida_foto_path: string | null;
  salida_manual: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Commit** (se commitea junto a Task 3, que es el primer consumidor compilable). Continuar.

---

## Task 3: Lógica de sueldo sobre `Turno` + tests (TDD)

**Files:**
- Modify: `package.json`
- Create: `scripts/test-sueldo.ts`
- Modify: `lib/fichaje/sueldo.ts`

- [ ] **Step 1: Agregar `tsx` y el script de test a package.json**

En `package.json`, en `"scripts"` agregar:
```json
    "test": "tsx scripts/test-sueldo.ts",
```
En `"devDependencies"` agregar:
```json
    "tsx": "^4.19.2",
```

- [ ] **Step 2: Instalar**

Run: `npm install`
Esperado: instala `tsx` sin errores.

- [ ] **Step 3: Escribir el test (falla a propósito: aún no existe la nueva firma)**

Create `scripts/test-sueldo.ts`:

```ts
// Tests de calcularPeriodo sobre el modelo turno-fila.
// Run: npm test   (usa tsx). Sale con código 1 si algo falla.
import assert from "node:assert/strict";
import { calcularPeriodo } from "../lib/fichaje/sueldo";
import type { SalaryHistory, Turno } from "../lib/fichaje/types";

let pasados = 0;
function test(nombre: string, fn: () => void) {
  try {
    fn();
    pasados++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    console.error(`  ✗ ${nombre}`);
    console.error(e);
    process.exit(1);
  }
}

// Empleado con sueldo mensual 30000 → diaria 1000, horaria 125 (8h).
const historial: SalaryHistory[] = [
  {
    id: "h1",
    employee_id: "e1",
    sueldo_mensual: 30000,
    sueldo_diario_override: null,
    tarifa_hora_override: null,
    horas_jornada_estandar: 8,
    vigente_desde: "2026-05-01",
    created_at: "2026-05-01T00:00:00Z",
  },
];

function turno(p: Partial<Turno> & Pick<Turno, "entrada_at">): Turno {
  return {
    id: Math.random().toString(36).slice(2),
    employee_id: "e1",
    tipo_jornada: "completa",
    extra_modo: null,
    nota: null,
    entrada_foto_url: null,
    entrada_foto_path: null,
    entrada_manual: false,
    salida_at: null,
    salida_foto_url: null,
    salida_foto_path: null,
    salida_manual: false,
    created_at: "2026-05-04T00:00:00Z",
    updated_at: "2026-05-04T00:00:00Z",
    ...p,
  };
}

console.log("calcularPeriodo:");

test("turno completo cerrado cuenta 1 día completo", () => {
  const turnos = [
    turno({ entrada_at: "2026-05-04T12:00:00Z", salida_at: "2026-05-04T20:00:00Z" }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.diasCompletos, 1);
  assert.equal(r.totalBase, 1000);
  assert.equal(r.dias[0]!.cerrado, true);
  assert.equal(r.dias[0]!.horas, 8);
});

test("turno abierto (sin salida) no cuenta", () => {
  const turnos = [turno({ entrada_at: "2026-05-05T12:00:00Z" })];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.diasCompletos, 0);
  assert.equal(r.totalBase, 0);
  assert.equal(r.dias[0]!.cerrado, false);
  assert.equal(r.dias[0]!.horas, null);
});

test("extra por horas vale horas reales × tarifa horaria", () => {
  const turnos = [
    turno({
      tipo_jornada: "extra",
      extra_modo: "horas",
      entrada_at: "2026-05-06T12:00:00Z",
      salida_at: "2026-05-06T16:00:00Z", // 4h
    }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.cantidadExtras, 1);
  assert.equal(r.totalExtras, 4 * 125);
  assert.equal(r.diasCompletos, 0);
});

test("extra fracción 1/2 vale media diaria", () => {
  const turnos = [
    turno({
      tipo_jornada: "extra",
      extra_modo: "medio",
      entrada_at: "2026-05-07T12:00:00Z",
      salida_at: "2026-05-07T16:00:00Z",
    }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: true });
  assert.equal(r.totalExtras, 500);
});

test("incluirExtras=false excluye extras del total", () => {
  const turnos = [
    turno({ entrada_at: "2026-05-04T12:00:00Z", salida_at: "2026-05-04T20:00:00Z" }),
    turno({
      tipo_jornada: "extra",
      extra_modo: "medio",
      entrada_at: "2026-05-07T12:00:00Z",
      salida_at: "2026-05-07T16:00:00Z",
    }),
  ];
  const r = calcularPeriodo(turnos, historial, { incluirExtras: false });
  assert.equal(r.total, 1000); // solo base
  assert.equal(r.totalExtras, 500); // se reporta pero no se suma
});

console.log(`\n${pasados} tests OK`);
```

- [ ] **Step 4: Correr el test y verificar que FALLA**

Run: `npm test`
Esperado: FALLA en compilación/ejecución porque `calcularPeriodo` todavía espera `ParFichaje[]` y `Turno` recién se agregó. (Error tipo "calcularPeriodo" firma incompatible o uso de `pares`.)

- [ ] **Step 5: Reescribir `sueldo.ts`**

En `lib/fichaje/sueldo.ts`:

1. Cambiar el import de tipos:
```ts
import type {
  ExtraModo,
  ExtraFracciones,
  SalaryHistory,
  Turno,
} from "./types";
import { DEFAULT_EXTRA_FRACCIONES } from "./types";
import { diaISOAR } from "./fechas";
```

2. Borrar la interface `ParFichaje` (líneas 63-71).

3. Reemplazar `calcularPeriodo` (toma `Turno[]`):
```ts
// Calcula el resumen del período a partir de los turnos del mes.
export function calcularPeriodo(
  turnos: Turno[],
  historial: SalaryHistory[],
  opts: { incluirExtras: boolean; fracciones?: ExtraFracciones },
): ResumenPeriodo {
  const fracciones = opts.fracciones ?? DEFAULT_EXTRA_FRACCIONES;
  const dias: DiaCalculado[] = [];

  let diasCompletos = 0;
  let totalBase = 0;
  let cantidadExtras = 0;
  let totalExtras = 0;

  for (const t of turnos) {
    const fechaISO = diaISOAR(t.entrada_at);
    const { tarifaDiaria, tarifaHoraria } = tarifaParaFecha(fechaISO, historial);

    const cerrado = t.salida_at != null;
    const horas = cerrado ? horasEntre(t.entrada_at, t.salida_at as string) : null;
    const tipo = t.tipo_jornada;
    const extraModo = t.extra_modo;

    let subtotal = 0;

    if (tipo === "completa") {
      if (cerrado) {
        subtotal = tarifaDiaria;
        diasCompletos += 1;
        totalBase += subtotal;
      }
    } else {
      if (cerrado && extraModo) {
        if (extraModo === "horas") {
          subtotal = (horas ?? 0) * tarifaHoraria;
        } else {
          subtotal = fraccionExtra(extraModo, fracciones) * tarifaDiaria;
        }
        cantidadExtras += 1;
        totalExtras += subtotal;
      }
    }

    dias.push({
      fechaISO,
      tipo,
      extraModo,
      horas,
      subtotal,
      cerrado,
      nota: t.nota,
    });
  }

  const total = totalBase + (opts.incluirExtras ? totalExtras : 0);

  return { dias, diasCompletos, totalBase, cantidadExtras, totalExtras, total };
}
```

4. Borrar todo lo de emparejado: las constantes `MAX_TURNO_HORAS` / `MAX_TURNO_MS` (líneas 184-189) y la función `emparejarFichajes` completa (líneas 191-264). Dejar `tarifaParaFecha`, `fraccionExtra`, `horasEntre`, `DiaCalculado`, `ResumenPeriodo`, `TarifaVigente`, `formatARS`, `DIAS_MES`.

- [ ] **Step 6: Correr el test y verificar que PASA**

Run: `npm test`
Esperado: `5 tests OK`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/test-sueldo.ts lib/fichaje/sueldo.ts lib/fichaje/types.ts
git commit -m "feat(lib): liquidación sobre turno-fila + tests

Borra emparejarFichajes/MAX_TURNO_HORAS/ParFichaje. calcularPeriodo
toma Turno[] directo. Agrega tsx + scripts/test-sueldo.ts (5 casos).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: `historial.ts` — `getTurnosMes`

**Files:**
- Modify: `lib/fichaje/historial.ts`

- [ ] **Step 1: Reescribir el archivo**

Reemplazar el contenido completo de `lib/fichaje/historial.ts` por:

```ts
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { Turno } from "./types";

// Rango [desde, hasta) de un mes YYYY-MM.
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const desde = new Date(Date.UTC(y, m - 1, 1));
  const hasta = new Date(Date.UTC(y, m, 1));
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

// Turnos de un empleado en un mes (anclados por entrada_at). Sin buffer ±1 día:
// con turno-fila el cruce de medianoche vive en una sola fila.
export async function getTurnosMes(
  employeeId: string,
  mes: string,
): Promise<Turno[]> {
  const { desde, hasta } = rangoMes(mes);
  const { data, error } = await createServiceClient()
    .schema("fichaje")
    .from("turnos")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("entrada_at", desde)
    .lt("entrada_at", hasta)
    .order("entrada_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}
```

- [ ] **Step 2: Verificar typecheck del módulo** (otros consumidores se arreglan en sus tasks)

Run: `npx tsc --noEmit lib/fichaje/historial.ts 2>&1 | head -5` (puede reportar errores de consumidores; el archivo en sí no debe tener errores de sintaxis/tipos propios).

- [ ] **Step 3: Commit**

```bash
git add lib/fichaje/historial.ts
git commit -m "feat(lib): getTurnosMes reemplaza getParesMes/getFichajesMes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: `queries.ts` — sacar `getUltimoFichajeHoy`

**Files:**
- Modify: `lib/fichaje/queries.ts`

- [ ] **Step 1: Editar el archivo**

En `lib/fichaje/queries.ts`:
1. Cambiar el import a: `import type { Employee } from "./types";` (sacar `TimeRecord`).
2. Borrar la función `getUltimoFichajeHoy` completa (líneas 30-46).

Quedan `getEmpleadosActivos` y `getEmpleado`.

- [ ] **Step 2: Commit**

```bash
git add lib/fichaje/queries.ts
git commit -m "refactor(lib): saca getUltimoFichajeHoy (sin sugerencia de tipo)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: API `POST /api/turno` (abrir entrada)

**Files:**
- Create: `app/api/turno/route.ts`

- [ ] **Step 1: Escribir la route**

Create `app/api/turno/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import {
  verificarPin,
  hashPin,
  pinValido,
  firmarSesion,
  EMPLEADO_COOKIE,
} from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Abre un turno (entrada) desde el celular del local. Sin login: service role.
// Pide PIN (lo crea en el primer fichaje si no tiene). Sube la selfie de entrada.

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
  tipo_jornada: z.enum(["completa", "extra"]).default("completa"),
  extra_modo: z.enum(["cuarto", "medio", "completo", "horas"]).nullable().optional(),
  nota: z.string().max(200).nullable().optional(),
  at: z.string().datetime(), // ISO; "Hora actual" o elegido a mano
  manual: z.boolean().default(false),
  foto_base64: z.string().min(100),
});

const intentosPin = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;
const MAX_ANTIGUEDAD_DIAS = 90;

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) throw new Error("formato de imagen inválido");
  const ext = m[1] === "png" ? "png" : "jpg";
  return { buffer: Buffer.from(m[2]!, "base64"), ext };
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  // Validar el momento.
  const cuando = new Date(input.at);
  const ahora = Date.now();
  if (cuando.getTime() > ahora + 2 * 60_000) {
    return NextResponse.json({ error: "No podés fichar en el futuro." }, { status: 400 });
  }
  if (ahora - cuando.getTime() > MAX_ANTIGUEDAD_DIAS * 86_400_000) {
    return NextResponse.json(
      { error: `Solo se pueden cargar fichajes de los últimos ${MAX_ANTIGUEDAD_DIAS} días.` },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: emp, error: empErr } = await db
    .from("employees")
    .select("id, activo, modalidad_pago, pin_hash")
    .eq("id", input.employee_id)
    .maybeSingle();
  if (empErr) return NextResponse.json({ error: "error de base" }, { status: 500 });
  if (!emp || !emp.activo) {
    return NextResponse.json({ error: "empleado inexistente o inactivo" }, { status: 404 });
  }

  // Lockout de PIN.
  const estadoPin = intentosPin.get(input.employee_id);
  if (estadoPin && estadoPin.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos de PIN. Probá en unos minutos." },
      { status: 429 },
    );
  }
  if (emp.pin_hash) {
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
    if (!pinValido(input.pin)) {
      return NextResponse.json({ error: "El PIN debe tener 4 a 8 dígitos" }, { status: 400 });
    }
    const nuevoHash = await hashPin(input.pin);
    const { error: pinErr } = await db
      .from("employees")
      .update({ pin_hash: nuevoHash })
      .eq("id", input.employee_id);
    if (pinErr) return NextResponse.json({ error: "no se pudo guardar el PIN" }, { status: 500 });
  }

  // Reglas por modalidad al abrir entrada.
  let tipoJornada = input.tipo_jornada;
  let extraModo = input.extra_modo ?? null;
  if (emp.modalidad_pago === "jornada") {
    tipoJornada = "completa";
    extraModo = null;
  } else if (emp.modalidad_pago === "horas") {
    tipoJornada = "extra";
    extraModo = "horas";
  }
  // mixto: respeta lo que mandó la UI.

  // Subir selfie de entrada.
  let fotoPath: string | null = null;
  let fotoUrl: string | null = null;
  try {
    const { buffer, ext } = dataUrlToBuffer(input.foto_base64);
    const ym = input.at.slice(0, 7);
    fotoPath = `${input.employee_id}/${ym}/${Date.now()}-entrada.${ext}`;
    const { error: upErr } = await svc.storage
      .from("fichaje-selfies")
      .upload(fotoPath, buffer, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: false,
      });
    if (upErr) throw upErr;
    const { data: signed } = await svc.storage
      .from("fichaje-selfies")
      .createSignedUrl(fotoPath, 3600);
    fotoUrl = signed?.signedUrl ?? null;
  } catch {
    return NextResponse.json({ error: "no se pudo guardar la foto" }, { status: 500 });
  }

  const { data: ins, error: insErr } = await db
    .from("turnos")
    .insert({
      employee_id: input.employee_id,
      tipo_jornada: tipoJornada,
      extra_modo: extraModo,
      nota: input.nota ?? null,
      entrada_at: cuando.toISOString(),
      entrada_foto_path: fotoPath,
      entrada_foto_url: fotoUrl,
      entrada_manual: input.manual,
    })
    .select("id")
    .single();
  if (insErr || !ins) {
    return NextResponse.json({ error: "no se pudo registrar la entrada" }, { status: 500 });
  }

  // PIN válido = sesión de empleado (para ver el historial propio).
  const cookieStore = await cookies();
  cookieStore.set(EMPLEADO_COOKIE, await firmarSesion(input.employee_id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true, id: ins.id });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores nuevos en `app/api/turno/route.ts` (puede haber errores en archivos aún no migrados; ignorar esos).

- [ ] **Step 3: Commit**

```bash
git add app/api/turno/route.ts
git commit -m "feat(api): POST /api/turno abre entrada (turno-fila)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: API `POST /api/turno/[id]/salida` (cerrar)

**Files:**
- Create: `app/api/turno/[id]/salida/route.ts`

- [ ] **Step 1: Escribir la route**

Create `app/api/turno/[id]/salida/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarPin } from "@/lib/fichaje/pin";

export const runtime = "nodejs";

// Cierra un turno abierto (setea la salida). Verifica PIN del dueño del turno.

const schema = z.object({
  pin: z.string().min(4).max(8),
  at: z.string().datetime(),
  manual: z.boolean().default(false),
  foto_base64: z.string().min(100),
});

const intentosPin = new Map<string, { fails: number; hasta: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60_000;

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  if (!m) throw new Error("formato de imagen inválido");
  const ext = m[1] === "png" ? "png" : "jpg";
  return { buffer: Buffer.from(m[2]!, "base64"), ext };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const input = parsed.data;

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  // Traer el turno + el hash del empleado dueño.
  const { data: turno, error: tErr } = await db
    .from("turnos")
    .select("id, employee_id, entrada_at, salida_at")
    .eq("id", id)
    .maybeSingle();
  if (tErr) return NextResponse.json({ error: "error de base" }, { status: 500 });
  if (!turno) return NextResponse.json({ error: "turno inexistente" }, { status: 404 });
  if (turno.salida_at != null) {
    return NextResponse.json({ error: "ese turno ya tiene salida" }, { status: 409 });
  }

  const { data: emp } = await db
    .from("employees")
    .select("id, activo, pin_hash")
    .eq("id", turno.employee_id)
    .maybeSingle();
  if (!emp || !emp.activo) {
    return NextResponse.json({ error: "empleado inactivo" }, { status: 404 });
  }
  if (!emp.pin_hash) {
    return NextResponse.json({ error: "el empleado no tiene PIN" }, { status: 400 });
  }

  // Lockout + verificación de PIN.
  const estadoPin = intentosPin.get(emp.id);
  if (estadoPin && estadoPin.hasta > Date.now()) {
    return NextResponse.json(
      { error: "Demasiados intentos de PIN. Probá en unos minutos." },
      { status: 429 },
    );
  }
  const ok = await verificarPin(input.pin, emp.pin_hash);
  if (!ok) {
    const fails = (estadoPin?.fails ?? 0) + 1;
    intentosPin.set(emp.id, {
      fails,
      hasta: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
    });
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }
  intentosPin.delete(emp.id);

  // Validar el momento de salida.
  const cuando = new Date(input.at);
  if (cuando.getTime() > Date.now() + 2 * 60_000) {
    return NextResponse.json({ error: "No podés fichar en el futuro." }, { status: 400 });
  }
  if (cuando.getTime() < new Date(turno.entrada_at).getTime()) {
    return NextResponse.json(
      { error: "La salida tiene que ser posterior a la entrada." },
      { status: 400 },
    );
  }

  // Subir selfie de salida.
  let fotoPath: string | null = null;
  let fotoUrl: string | null = null;
  try {
    const { buffer, ext } = dataUrlToBuffer(input.foto_base64);
    const ym = input.at.slice(0, 7);
    fotoPath = `${emp.id}/${ym}/${Date.now()}-salida.${ext}`;
    const { error: upErr } = await svc.storage
      .from("fichaje-selfies")
      .upload(fotoPath, buffer, {
        contentType: ext === "png" ? "image/png" : "image/jpeg",
        upsert: false,
      });
    if (upErr) throw upErr;
    const { data: signed } = await svc.storage
      .from("fichaje-selfies")
      .createSignedUrl(fotoPath, 3600);
    fotoUrl = signed?.signedUrl ?? null;
  } catch {
    return NextResponse.json({ error: "no se pudo guardar la foto" }, { status: 500 });
  }

  const { error: upErr } = await db
    .from("turnos")
    .update({
      salida_at: cuando.toISOString(),
      salida_foto_path: fotoPath,
      salida_foto_url: fotoUrl,
      salida_manual: input.manual,
    })
    .eq("id", id)
    .is("salida_at", null); // guard contra doble cierre concurrente
  if (upErr) {
    return NextResponse.json({ error: "no se pudo registrar la salida" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores nuevos en este archivo.

- [ ] **Step 3: Commit**

```bash
git add app/api/turno/[id]/salida/route.ts
git commit -m "feat(api): POST /api/turno/[id]/salida cierra turno

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: API `POST /api/mis-turnos` + borrar rutas viejas

**Files:**
- Create: `app/api/mis-turnos/route.ts`
- Delete: `app/api/fichar/route.ts`, `app/api/fichaje-tardio/route.ts`

- [ ] **Step 1: Escribir la route de listado**

Create `app/api/mis-turnos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { verificarPin, firmarSesion, EMPLEADO_COOKIE } from "@/lib/fichaje/pin";
import { getTurnosMes, mesActual } from "@/lib/fichaje/historial";
import type { Turno } from "@/lib/fichaje/types";

export const runtime = "nodejs";

// Lista los turnos del mes del empleado para la tabla post-PIN. Verifica PIN y
// re-firma las fotos (las URLs guardadas vencen a la hora). PIN válido = sesión
// de empleado (para que "Ver mi historial" funcione aunque todavía no fiche).

const schema = z.object({
  employee_id: z.string().uuid(),
  pin: z.string().min(4).max(8),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  }
  const { employee_id, pin, mes } = parsed.data;

  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: emp } = await db
    .from("employees")
    .select("id, activo, pin_hash")
    .eq("id", employee_id)
    .maybeSingle();
  if (!emp || !emp.activo || !emp.pin_hash) {
    return NextResponse.json({ error: "empleado inválido" }, { status: 404 });
  }
  const ok = await verificarPin(pin, emp.pin_hash);
  if (!ok) return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });

  // PIN válido → sesión de empleado.
  const cookieStore = await cookies();
  cookieStore.set(EMPLEADO_COOKIE, await firmarSesion(employee_id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  const turnos = await getTurnosMes(employee_id, mes ?? mesActual());

  // Re-firmar las fotos presentes (entrada + salida).
  const paths = turnos
    .flatMap((t) => [t.entrada_foto_path, t.salida_foto_path])
    .filter((p): p is string => !!p);
  const firmadas = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await svc.storage
      .from("fichaje-selfies")
      .createSignedUrls(paths, 3600);
    data?.forEach((d) => {
      if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
    });
  }
  const conUrls: Turno[] = turnos.map((t) => ({
    ...t,
    entrada_foto_url: t.entrada_foto_path
      ? (firmadas.get(t.entrada_foto_path) ?? null)
      : null,
    salida_foto_url: t.salida_foto_path
      ? (firmadas.get(t.salida_foto_path) ?? null)
      : null,
  }));

  return NextResponse.json({ ok: true, turnos: conUrls });
}
```

- [ ] **Step 2: Borrar las rutas viejas**

```bash
git rm app/api/fichar/route.ts app/api/fichaje-tardio/route.ts
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores nuevos en `app/api/mis-turnos/route.ts`. (Aún fallan FichajeFlow / páginas que migran después.)

- [ ] **Step 4: Commit**

```bash
git add app/api/mis-turnos/route.ts
git commit -m "feat(api): POST /api/mis-turnos lista turnos + borra rutas viejas

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Componente `FichajeDialog`

**Files:**
- Create: `components/fichaje/FichajeDialog.tsx`

- [ ] **Step 1: Escribir el componente**

Create `components/fichaje/FichajeDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { CameraCapture } from "@/components/fichaje/CameraCapture";
import type { ExtraModo, ModalidadPago, TipoJornada } from "@/lib/fichaje/types";

type Paso = "form" | "camara" | "enviando";

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

function hoyISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// Diálogo unificado de fichaje. Sirve para abrir entrada (mode="entrada") y para
// cerrar un turno (mode="salida"). Por defecto usa "Hora actual" (now()); el
// empleado puede elegir hora/día a mano (queda marcado manual=true).
export function FichajeDialog({
  employeeId,
  pin,
  modalidad,
  mode,
  turnoId,
  onDone,
  onCancel,
}: {
  employeeId: string;
  pin: string;
  modalidad: ModalidadPago;
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
  const [tipoJornada, setTipoJornada] = useState<TipoJornada>("completa");
  const [extraModo, setExtraModo] = useState<ExtraModo>("medio");
  const [error, setError] = useState<string | null>(null);

  const pedirJornada = mode === "entrada" && modalidad === "mixto";

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

  async function enviar(foto: string) {
    const armado = calcularAt();
    if (!armado) {
      setPaso("form");
      return;
    }
    setPaso("enviando");
    setError(null);

    const url = mode === "entrada" ? "/api/turno" : `/api/turno/${turnoId}/salida`;
    const body =
      mode === "entrada"
        ? {
            employee_id: employeeId,
            pin,
            tipo_jornada: pedirJornada ? tipoJornada : "completa",
            extra_modo:
              pedirJornada && tipoJornada === "extra" ? extraModo : null,
            at: armado.at,
            manual: armado.manual,
            foto_base64: foto,
          }
        : { pin, at: armado.at, manual: armado.manual, foto_base64: foto };

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
    return <CameraCapture onCapture={enviar} onCancel={() => setPaso("form")} />;
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
          {/* Toggle Hora actual / a mano */}
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
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores en `FichajeDialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/fichaje/FichajeDialog.tsx
git commit -m "feat(fichaje): diálogo unificado con Hora actual + selfie

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: Componente `TurnosTable`

**Files:**
- Create: `components/fichaje/TurnosTable.tsx`

- [ ] **Step 1: Escribir el componente**

Create `components/fichaje/TurnosTable.tsx`:

```tsx
"use client";

import { useState } from "react";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import { Button } from "@/components/ui/Button";
import { FichajeDialog } from "./FichajeDialog";
import type { ModalidadPago, Turno } from "@/lib/fichaje/types";

// Marca de fichaje cargado fuera del momento (hora a mano).
function BadgeManual() {
  return (
    <span
      title="Fichaje fuera de horario (hora cargada a mano)"
      aria-label="Fichaje fuera de horario"
      className="ml-1 inline-flex cursor-help items-center rounded-md bg-accent/20 px-1 py-0.5 text-[10px] text-accent"
    >
      ⏱
    </span>
  );
}

type Dialogo =
  | { tipo: "entrada" }
  | { tipo: "salida"; turnoId: string }
  | null;

export function TurnosTable({
  turnos,
  employeeId,
  pin,
  modalidad,
  onChanged,
}: {
  turnos: Turno[];
  employeeId: string;
  pin: string;
  modalidad: ModalidadPago;
  onChanged: () => void; // re-fetch en el padre tras un fichaje
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);

  function cerrarYRefrescar() {
    setDialogo(null);
    onChanged();
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-muted/15">
        <table className="w-full text-sm">
          <thead className="bg-bg-card text-muted">
            <tr>
              <th className="px-3 py-3 text-left">Día</th>
              <th className="px-3 py-3 text-left">Entrada</th>
              <th className="px-3 py-3 text-left">Salida</th>
              <th className="px-3 py-3 text-left">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {turnos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  Todavía no fichaste este mes.
                </td>
              </tr>
            )}
            {turnos.map((t) => (
              <tr key={t.id} className="border-t border-muted/10">
                <td className="px-3 py-3 text-cream">
                  {formatAR(t.entrada_at, "EEE d MMM")}
                </td>
                <td className="px-3 py-3 text-cream">
                  {horaAR(t.entrada_at)}
                  {t.entrada_manual && <BadgeManual />}
                </td>
                <td className="px-3 py-3 text-cream">
                  {t.salida_at ? (
                    <>
                      {horaAR(t.salida_at)}
                      {t.salida_manual && <BadgeManual />}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDialogo({ tipo: "salida", turnoId: t.id })}
                      className="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-bg-deep transition active:scale-95"
                    >
                      Fichar
                    </button>
                  )}
                </td>
                <td className="px-3 py-3 text-muted">
                  {t.tipo_jornada === "completa"
                    ? "Jornada"
                    : `Extra${t.extra_modo ? " " + t.extra_modo : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button size="xl" className="w-full" onClick={() => setDialogo({ tipo: "entrada" })}>
        Fichar Nueva Entrada
      </Button>

      {dialogo && (
        <FichajeDialog
          employeeId={employeeId}
          pin={pin}
          modalidad={modalidad}
          mode={dialogo.tipo}
          turnoId={dialogo.tipo === "salida" ? dialogo.turnoId : undefined}
          onDone={cerrarYRefrescar}
          onCancel={() => setDialogo(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores en `TurnosTable.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/fichaje/TurnosTable.tsx
git commit -m "feat(fichaje): tabla de turnos con Fichar / Nueva Entrada

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 11: Reescribir `FichajeFlow` + página `[employeeId]`

**Files:**
- Modify: `components/fichaje/FichajeFlow.tsx` (reescritura completa)
- Modify: `app/(publico)/fichar/[employeeId]/page.tsx`

- [ ] **Step 1: Reescribir `FichajeFlow.tsx`**

Reemplazar el contenido completo por:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PinPad } from "./PinPad";
import { TurnosTable } from "./TurnosTable";
import type { ModalidadPago, Turno } from "@/lib/fichaje/types";

type Paso = "pin" | "tabla" | "cargando";

function mesActualISO(): string {
  return new Date().toISOString().slice(0, 7);
}

export function FichajeFlow({
  empleadoId,
  nombre,
  modalidad,
  tienePin,
}: {
  empleadoId: string;
  nombre: string;
  modalidad: ModalidadPago;
  tienePin: boolean;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("pin");
  const [pin, setPin] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verificandoPin, setVerificandoPin] = useState(false);

  // Trae los turnos del mes con el PIN ya validado.
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
        // Primera vez: crear el PIN antes de mostrar la tabla.
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
        modalidad={modalidad}
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
```

- [ ] **Step 2: Actualizar la página `[employeeId]`**

Reemplazar el contenido de `app/(publico)/fichar/[employeeId]/page.tsx` por:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEmpleado } from "@/lib/fichaje/queries";
import { FichajeFlow } from "@/components/fichaje/FichajeFlow";

export const dynamic = "force-dynamic";

export default async function FicharEmpleadoPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const empleado = await getEmpleado(employeeId);
  if (!empleado || !empleado.activo) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <Link href="/fichar" className="mb-6 inline-block text-sm text-muted">
        ← Volver
      </Link>
      <FichajeFlow
        empleadoId={empleado.id}
        nombre={empleado.nombre}
        modalidad={empleado.modalidad_pago}
        tienePin={!!empleado.pin_hash}
      />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores en estos dos archivos.

- [ ] **Step 4: Commit**

```bash
git add components/fichaje/FichajeFlow.tsx "app/(publico)/fichar/[employeeId]/page.tsx"
git commit -m "feat(fichaje): flujo PIN → tabla de turnos

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: `mi-historial` solo lectura + borrar `AgregarFichajeTardio`

**Files:**
- Modify: `app/(empleado)/mi-historial/page.tsx`
- Delete: `components/empleado/AgregarFichajeTardio.tsx`

- [ ] **Step 1: Reescribir `mi-historial/page.tsx`**

Reemplazar el contenido completo por:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import { verificarSesion, EMPLEADO_COOKIE } from "@/lib/fichaje/session";
import { getEmpleado } from "@/lib/fichaje/queries";
import { getTurnosMes, mesActual } from "@/lib/fichaje/historial";
import { MesSelector } from "@/components/empleado/MesSelector";
import { LogoutButton } from "@/components/empleado/LogoutButton";

// Marca para fichajes cargados fuera del momento (hora a mano).
function BadgeManual() {
  return (
    <span
      title="Fichaje fuera de horario (hora cargada a mano)"
      aria-label="Fichaje fuera de horario"
      className="ml-2 inline-flex cursor-help items-center rounded-md bg-accent/20 px-1.5 py-0.5 text-xs text-accent"
    >
      ⏱
    </span>
  );
}

export const dynamic = "force-dynamic";

export default async function MiHistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const cookieStore = await cookies();
  const empId = await verificarSesion(cookieStore.get(EMPLEADO_COOKIE)?.value);
  if (!empId) redirect("/login");

  const empleado = await getEmpleado(empId);
  if (!empleado) redirect("/login");

  const mes = mesParam ?? mesActual();
  const turnos = await getTurnosMes(empId, mes);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-cream">
            Hola, {empleado.nombre}
          </h1>
          <p className="text-sm text-muted">Tu historial de fichajes</p>
        </div>
        <LogoutButton />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MesSelector mes={mes} />
      </div>

      {turnos.length === 0 ? (
        <p className="mt-8 text-center text-muted">
          No hay fichajes registrados este mes.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-muted/15">
          <table className="w-full text-sm">
            <thead className="bg-bg-card text-muted">
              <tr>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Entrada</th>
                <th className="px-4 py-3 text-left">Salida</th>
                <th className="px-4 py-3 text-right">Horas</th>
                <th className="px-4 py-3 text-left">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => {
                const horas = t.salida_at
                  ? (
                      (new Date(t.salida_at).getTime() -
                        new Date(t.entrada_at).getTime()) /
                      3_600_000
                    ).toFixed(1)
                  : "—";
                return (
                  <tr key={t.id} className="border-t border-muted/10">
                    <td className="px-4 py-3 text-cream">
                      {formatAR(t.entrada_at, "EEE d MMM")}
                    </td>
                    <td className="px-4 py-3 text-cream">
                      {horaAR(t.entrada_at)}
                      {t.entrada_manual && <BadgeManual />}
                    </td>
                    <td className="px-4 py-3 text-cream">
                      {t.salida_at ? (
                        <>
                          {horaAR(t.salida_at)}
                          {t.salida_manual && <BadgeManual />}
                        </>
                      ) : (
                        <span className="text-muted">abierto</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-cream">{horas}</td>
                    <td className="px-4 py-3">
                      <span className="text-muted">
                        {t.tipo_jornada === "completa"
                          ? "Jornada"
                          : `Extra${t.extra_modo ? " " + t.extra_modo : ""}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-muted">
        Solo ves tus propios fichajes. Para fichar, usá la pantalla del local.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Borrar `AgregarFichajeTardio`**

```bash
git rm components/empleado/AgregarFichajeTardio.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores en `mi-historial/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add "app/(empleado)/mi-historial/page.tsx"
git commit -m "feat(empleado): mi-historial solo lectura sobre turnos

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 13: Panel admin + galería + borrado de turno

**Files:**
- Modify: `lib/fichaje/mutations.ts`
- Modify: `components/admin/BorrarFichajeBtn.tsx`
- Modify: `components/admin/SelfieGallery.tsx`
- Modify: `app/(admin)/admin/empleados/[id]/page.tsx`

- [ ] **Step 1: `mutations.ts` — `eliminarTurno` + `eliminarEmpleado`**

En `lib/fichaje/mutations.ts`:

Reemplazar `eliminarFichaje` (líneas 97-118) por:
```ts
// ---------- Eliminar un turno (staff) — borra fila + sus 2 selfies ----------
export async function eliminarTurno(turnoId: string): Promise<ActionResult> {
  await requireStaff();
  const svc = createServiceClient();
  const db = svc.schema("fichaje");

  const { data: t } = await db
    .from("turnos")
    .select("entrada_foto_path, salida_foto_path, employee_id")
    .eq("id", turnoId)
    .maybeSingle();
  const paths = [t?.entrada_foto_path, t?.salida_foto_path].filter(
    (p): p is string => !!p,
  );
  if (paths.length > 0) {
    await svc.storage.from("fichaje-selfies").remove(paths);
  }

  const { error } = await db.from("turnos").delete().eq("id", turnoId);
  if (error) return { ok: false, error: "No se pudo borrar el turno" };
  if (t?.employee_id) revalidatePath(`/admin/empleados/${t.employee_id}`);
  return { ok: true };
}
```

En `eliminarEmpleado` (paso 1, juntar paths), reemplazar el bloque que lee `time_records`:
```ts
  const { data: registros } = await db
    .from("turnos")
    .select("entrada_foto_path, salida_foto_path")
    .eq("employee_id", employeeId);
  const paths = (registros ?? [])
    .flatMap((r) => [r.entrada_foto_path, r.salida_foto_path])
    .filter((p): p is string => !!p);
```
(El comentario del cascade sigue válido: borra `turnos` + `salary_history`.)

- [ ] **Step 2: `BorrarFichajeBtn.tsx` — usar `turnoId` + `eliminarTurno`**

Reemplazar el contenido por:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarTurno } from "@/lib/fichaje/mutations";

// Borra un turno completo (entrada+salida) desde el panel admin.
export function BorrarFichajeBtn({
  turnoId,
  etiqueta,
}: {
  turnoId: string;
  etiqueta: string; // ej: "turno del 4 de mayo"
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pending, start] = useTransition();

  function borrar() {
    start(async () => {
      const r = await eliminarTurno(turnoId);
      setConfirmando(false);
      if (r.ok) router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        title={`Borrar ${etiqueta}`}
        aria-label={`Borrar ${etiqueta}`}
        className="text-muted transition hover:text-red-400"
      >
        ✕
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={borrar}
        disabled={pending}
        className="rounded bg-red-600 px-2 py-0.5 font-medium text-white disabled:opacity-50"
      >
        {pending ? "…" : "Borrar"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="text-muted hover:text-cream"
      >
        no
      </button>
    </span>
  );
}
```

- [ ] **Step 3: `SelfieGallery.tsx` — `marca` en vez de `tipo: TipoFichaje`**

En `components/admin/SelfieGallery.tsx`:

1. Cambiar el import (sacar `TipoFichaje`):
```ts
import type { TipoJornada, ExtraModo } from "@/lib/fichaje/types";
```
2. Cambiar la interface y `tipoTexto`:
```ts
export interface SelfieItem {
  url: string;
  timestamp: string;
  marca: "entrada" | "salida";
  tipoJornada: TipoJornada;
  extraModo: ExtraModo | null;
  nota: string | null;
}
```
```ts
function tipoTexto(item: SelfieItem): string {
  const accion = item.marca === "entrada" ? "Entrada" : "Salida";
  const detalle =
    item.tipoJornada === "completa"
      ? "Jornada completa"
      : item.extraModo
        ? EXTRA_LABEL[item.extraModo]
        : "Extra";
  return `${accion} · ${detalle}`;
}
```
3. En el badge de la miniatura (donde dice `it.tipo === "entrada"`), reemplazar las dos referencias `it.tipo` por `it.marca`.

- [ ] **Step 4: Reescribir `admin/empleados/[id]/page.tsx`**

Reemplazar el contenido completo por:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatAR, horaAR } from "@/lib/fichaje/fechas";
import {
  getEmpleadoAdmin,
  getSalaryHistory,
  getFraccionesExtra,
} from "@/lib/fichaje/admin";
import { getTurnosMes, mesActual } from "@/lib/fichaje/historial";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularPeriodo } from "@/lib/fichaje/sueldo";
import { MesSelector } from "@/components/empleado/MesSelector";
import { ConfigSueldoForm } from "@/components/admin/ConfigSueldoForm";
import { EmpleadoAcciones } from "@/components/admin/EmpleadoAcciones";
import { SueldoSummary } from "@/components/admin/SueldoSummary";
import { Card, Badge } from "@/components/ui/Card";
import { SelfieThumb } from "@/components/admin/SelfieThumb";
import { BorrarFichajeBtn } from "@/components/admin/BorrarFichajeBtn";
import { SelfieGallery, type SelfieItem } from "@/components/admin/SelfieGallery";

export const dynamic = "force-dynamic";

function BadgeManual() {
  return (
    <span
      title="Fichaje fuera de horario (hora cargada a mano)"
      aria-label="Fichaje fuera de horario"
      className="inline-flex shrink-0 cursor-help items-center rounded-md bg-accent/20 px-1.5 py-0.5 text-xs text-accent"
    >
      ⏱
    </span>
  );
}

function tipoBadge(tipo: string, extraModo: string | null): string {
  if (tipo === "completa") return "Jornada";
  const map: Record<string, string> = {
    cuarto: "Extra 1/4",
    medio: "Extra 1/2",
    completo: "Extra día",
    horas: "Extra h",
  };
  return extraModo ? (map[extraModo] ?? "Extra") : "Extra";
}

export default async function EmpleadoDetalle({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes: mesParam } = await searchParams;
  const mes = mesParam ?? mesActual();

  const empleado = await getEmpleadoAdmin(id);
  if (!empleado) notFound();

  const [historial, fracciones, turnos] = await Promise.all([
    getSalaryHistory(id),
    getFraccionesExtra(),
    getTurnosMes(id, mes),
  ]);

  // Firmar URLs de las selfies presentes (entrada + salida).
  const paths = turnos
    .flatMap((t) => [t.entrada_foto_path, t.salida_foto_path])
    .filter((p): p is string => !!p);
  const firmadas = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await createServiceClient()
      .storage.from("fichaje-selfies")
      .createSignedUrls(paths, 3600);
    data?.forEach((d) => {
      if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
    });
  }

  const resumen = calcularPeriodo(turnos, historial, {
    incluirExtras: true,
    fracciones,
  });

  // Galería: hasta 2 fotos por turno (entrada + salida).
  const galeria: SelfieItem[] = [];
  for (const t of turnos) {
    if (t.entrada_foto_path && firmadas.has(t.entrada_foto_path)) {
      galeria.push({
        url: firmadas.get(t.entrada_foto_path) as string,
        timestamp: t.entrada_at,
        marca: "entrada",
        tipoJornada: t.tipo_jornada,
        extraModo: t.extra_modo,
        nota: t.nota,
      });
    }
    if (t.salida_at && t.salida_foto_path && firmadas.has(t.salida_foto_path)) {
      galeria.push({
        url: firmadas.get(t.salida_foto_path) as string,
        timestamp: t.salida_at,
        marca: "salida",
        tipoJornada: t.tipo_jornada,
        extraModo: t.extra_modo,
        nota: t.nota,
      });
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/empleados" className="text-sm text-muted">
          ← Empleados
        </Link>
        <h1 className="mt-2 font-heading text-4xl text-cream">
          {empleado.nombre} {empleado.apellido ?? ""}
        </h1>
        <p className="text-muted">{empleado.rol ?? "Sin puesto"}</p>
      </div>

      <Card>
        <EmpleadoAcciones empleado={empleado} />
      </Card>

      <Card>
        <h2 className="mb-4 font-heading text-2xl text-cream">
          Configuración de pago
        </h2>
        <ConfigSueldoForm empleado={empleado} />
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl text-cream">Período</h2>
        <MesSelector mes={mes} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-muted/15">
        <table className="w-full text-sm">
          <thead className="bg-bg-card text-muted">
            <tr>
              <th className="px-3 py-3 text-left">Fecha</th>
              <th className="px-3 py-3 text-left">Tipo</th>
              <th className="px-3 py-3 text-left">Entrada</th>
              <th className="px-3 py-3 text-left">Salida</th>
              <th className="px-3 py-3 text-right">Horas</th>
              <th className="px-3 py-3 text-right">Subtotal</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {turnos.map((t, i) => {
              const d = resumen.dias[i]!;
              return (
                <tr key={t.id} className="border-t border-muted/10">
                  <td className="px-3 py-3 text-cream">
                    {formatAR(t.entrada_at, "EEE d")}
                  </td>
                  <td className="px-3 py-3">
                    <Badge>{tipoBadge(d.tipo, d.extraModo)}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <SelfieThumb
                        url={
                          t.entrada_foto_path
                            ? (firmadas.get(t.entrada_foto_path) ?? null)
                            : null
                        }
                        hora={horaAR(t.entrada_at)}
                      />
                      {t.entrada_manual && <BadgeManual />}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {t.salida_at ? (
                      <div className="flex items-center gap-2">
                        <SelfieThumb
                          url={
                            t.salida_foto_path
                              ? (firmadas.get(t.salida_foto_path) ?? null)
                              : null
                          }
                          hora={horaAR(t.salida_at)}
                        />
                        {t.salida_manual && <BadgeManual />}
                      </div>
                    ) : (
                      <span className="text-muted">abierto</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-cream">
                    {d.horas != null ? d.horas.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-cream">
                    {d.subtotal > 0
                      ? new Intl.NumberFormat("es-AR", {
                          style: "currency",
                          currency: "ARS",
                          maximumFractionDigits: 0,
                        }).format(d.subtotal)
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <BorrarFichajeBtn
                      turnoId={t.id}
                      etiqueta={`turno del ${formatAR(t.entrada_at, "d 'de' MMMM")}`}
                    />
                  </td>
                </tr>
              );
            })}
            {turnos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">
                  Sin fichajes este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SueldoSummary
        diasCompletos={resumen.diasCompletos}
        totalBase={resumen.totalBase}
        cantidadExtras={resumen.cantidadExtras}
        totalExtras={resumen.totalExtras}
      />

      <section className="space-y-4">
        <h2 className="font-heading text-2xl text-cream">Fotos del mes</h2>
        <SelfieGallery
          items={galeria}
          nombre={empleado.nombre}
          apellido={empleado.apellido}
          rol={empleado.rol}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores. (Acá ya debería compilar TODO el repo salvo el cron y el seed, que se tocan en las próximas tasks. Si el cron aún referencia `time_records`, lo arregla Task 14.)

- [ ] **Step 6: Commit**

```bash
git add lib/fichaje/mutations.ts components/admin/BorrarFichajeBtn.tsx components/admin/SelfieGallery.tsx "app/(admin)/admin/empleados/[id]/page.tsx"
git commit -m "feat(admin): panel y galería sobre turnos + borrado de turno

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 14: Cron de rotación de fotos (entrada + salida)

**Files:**
- Modify: `app/api/cron/cleanup-photos/route.ts`

- [ ] **Step 1: Reescribir la route**

Reemplazar el contenido completo por:

```ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Rotación de fotos: borra selfies con más de 55 días, conserva el registro.
// Cada turno tiene 2 fotos (entrada/salida) con su propio momento.
const DIAS = 55;
const LOTE = 200;

type Lado = {
  col_at: "entrada_at" | "salida_at";
  col_path: "entrada_foto_path" | "salida_foto_path";
  col_url: "entrada_foto_url" | "salida_foto_url";
};

const LADOS: Lado[] = [
  { col_at: "entrada_at", col_path: "entrada_foto_path", col_url: "entrada_foto_url" },
  { col_at: "salida_at", col_path: "salida_foto_path", col_url: "salida_foto_url" },
];

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const svc = createServiceClient();
  const db = svc.schema("fichaje");
  const limite = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  let borradas = 0;

  for (const lado of LADOS) {
    const { data: viejos, error } = await db
      .from("turnos")
      .select(`id, ${lado.col_path}`)
      .lt(lado.col_at, limite)
      .not(lado.col_path, "is", null)
      .limit(LOTE);
    if (error) {
      return NextResponse.json({ error: "error de base" }, { status: 500 });
    }
    if (!viejos || viejos.length === 0) continue;

    const paths = viejos
      .map((r) => (r as Record<string, string | null>)[lado.col_path])
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await svc.storage.from("fichaje-selfies").remove(paths);
    }
    const ids = viejos.map((r) => (r as { id: string }).id);
    await db
      .from("turnos")
      .update({ [lado.col_path]: null, [lado.col_url]: null })
      .in("id", ids);
    borradas += paths.length;
  }

  return NextResponse.json({ ok: true, borradas });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/cleanup-photos/route.ts
git commit -m "feat(cron): limpia fotos de entrada y salida por separado

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 15: Reescribir seed de casos de prueba

**Files:**
- Modify: `scripts/seed-casos-prueba.mjs`

- [ ] **Step 1: Reescribir el script**

Reemplazar el contenido completo por:

```js
// Casos de prueba de turnos para testear historial y liquidación (modelo
// turno-fila). Cubre: turno normal, cruce de medianoche, doble jornada, turno
// abierto, extra por horas, fichaje con hora a mano (manual).
//
// Uso: node scripts/seed-casos-prueba.mjs
// Idempotente: borra primero los turnos marcados con "[PRUEBA]" en la nota.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] ??= m[2].trim();
    }
  } catch {}
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || serviceKey.includes("PEGAR")) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
const db = sb.schema("fichaje");

const EMPLEADO = { nombre: "Lucía", apellido: "Fernández" };
const TZ = "-03:00";
function ts(fechaHora) {
  return `${fechaHora}:00${TZ}`; // "2026-05-15T09:00" -> ISO ART
}

const NOTA = "[PRUEBA]";
const Y = "2026";
const M = "05";

// Cada caso es un turno (entrada + salida opcional).
const CASOS = [
  {
    titulo: "Turno normal mismo día (09:00 → 17:00 = 8h)",
    entrada_at: `${Y}-${M}-04T09:00`,
    salida_at: `${Y}-${M}-04T17:00`,
  },
  {
    titulo: "Cruza medianoche (Mié 18:00 → Jue 00:30 = 6.5h)",
    entrada_at: `${Y}-${M}-06T18:00`,
    salida_at: `${Y}-${M}-07T00:30`,
  },
  {
    titulo: "Turno abierto: solo entrada (Sáb 10:00, sin salida)",
    entrada_at: `${Y}-${M}-09T10:00`,
    salida_at: null,
  },
  {
    titulo: "Extra por horas (Lun 18:00 → 22:00 = 4h)",
    entrada_at: `${Y}-${M}-11T18:00`,
    salida_at: `${Y}-${M}-11T22:00`,
    tipo_jornada: "extra",
    extra_modo: "horas",
  },
  {
    titulo: "Fichaje con hora a mano (entrada y salida manual) → badge ⏱",
    entrada_at: `${Y}-${M}-14T08:00`,
    salida_at: `${Y}-${M}-14T16:00`,
    entrada_manual: true,
    salida_manual: true,
  },
];

const { data: emp, error: empErr } = await db
  .from("employees")
  .select("id, nombre, apellido")
  .eq("nombre", EMPLEADO.nombre)
  .eq("apellido", EMPLEADO.apellido)
  .maybeSingle();
if (empErr) {
  console.error("Error buscando empleado:", empErr.message);
  process.exit(1);
}
if (!emp) {
  console.error(
    `No existe ${EMPLEADO.nombre} ${EMPLEADO.apellido}. Corré primero: node scripts/seed-empleados.mjs`,
  );
  process.exit(1);
}

const { error: delErr } = await db
  .from("turnos")
  .delete()
  .eq("employee_id", emp.id)
  .eq("nota", NOTA);
if (delErr) {
  console.error("Error borrando pruebas previas:", delErr.message);
  process.exit(1);
}

const filas = CASOS.map((c) => ({
  employee_id: emp.id,
  tipo_jornada: c.tipo_jornada ?? "completa",
  extra_modo: c.extra_modo ?? null,
  nota: NOTA,
  entrada_at: ts(c.entrada_at),
  entrada_manual: c.entrada_manual ?? false,
  salida_at: c.salida_at ? ts(c.salida_at) : null,
  salida_manual: c.salida_manual ?? false,
}));

const { error: insErr } = await db.from("turnos").insert(filas);
if (insErr) {
  console.error("Error insertando casos:", insErr.message);
  process.exit(1);
}

console.log(`✓ ${filas.length} turnos insertados para ${emp.nombre} ${emp.apellido}.\n`);
console.log("Casos cargados:");
for (const c of CASOS) console.log(`  • ${c.titulo}`);
console.log(`\nAbrí /mi-historial (logueado como ${emp.nombre}) o el panel admin del empleado.`);
console.log("Para limpiar: volvé a correr este script (borra los [PRUEBA] antes de insertar).");
```

- [ ] **Step 2: Correr el seed (requiere `.env.local` con service key)**

Run: `node scripts/seed-casos-prueba.mjs`
Esperado: `✓ 5 turnos insertados para Lucía Fernández.`

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-casos-prueba.mjs
git commit -m "chore(seed): casos de prueba sobre turnos

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 16: Verificación final (typecheck + build + tests + e2e manual)

**Files:** ninguno (verificación).

- [ ] **Step 1: Tests de lógica**

Run: `npm test`
Esperado: `5 tests OK`, exit 0.

- [ ] **Step 2: Typecheck del repo entero**

Run: `npm run typecheck`
Esperado: sin errores. Si hay referencias residuales a `TimeRecord`, `getParesMes`, `getFichajesMes`, `getUltimoFichajeHoy`, `eliminarFichaje`, `emparejarFichajes` o `tipo`/`registrado_tarde`/`enlace_id`, corregir en el archivo que las use (no quedó ninguna en los archivos cubiertos por este plan).

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Esperado: build OK. Verificar que aparecen las rutas `/api/turno`, `/api/turno/[id]/salida`, `/api/mis-turnos` y que NO aparecen `/api/fichar` ni `/api/fichaje-tardio`.

- [ ] **Step 4: Smoke e2e manual (dev server)**

Run: `npm run dev` y en el navegador (o celular en la red):
1. `/fichar` → elegir empleado → ingresar PIN → ver la **tabla de turnos** (no la pantalla Entrada/Salida).
2. `Fichar Nueva Entrada` → "Hora actual" → selfie → la fila aparece abierta.
3. `Fichar` en esa fila → "Hora actual" → selfie → la fila se cierra con hora de salida.
4. `Fichar Nueva Entrada` → "Elegir hora" → fecha/hora pasada → selfie → la fila muestra el badge ⏱ (manual).
5. `/mi-historial` → se ven los turnos en solo lectura.
6. `/admin/empleados/[id]` → tabla con entrada/salida + thumbs, subtotal, galería con fotos de entrada y salida, y la ✕ borra el turno completo.

Esperado: todos los pasos OK. Anotar cualquier fallo y corregir antes de cerrar.

- [ ] **Step 5: Commit final (si hubo fixes del smoke)**

```bash
git add -A
git commit -m "fix: ajustes del smoke e2e turno-fila

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Notas de cierre

- `PINS_TEST` en `components/fichaje/EmployeeGrid.tsx` sigue siendo temporal — borrarlo antes de entregar a May (tarea aparte).
- La migración 0006 ya corre contra el Supabase real; al desplegar a Vercel no hace falta nada extra (las env vars ya están).
- `enlace_id`, `registrado_tarde`, `MAX_TURNO_HORAS`, `getParesMes` y `emparejarFichajes` quedan eliminados del código; el concepto de "fichaje tardío" se reemplazó por el flag `*_manual`.
```
