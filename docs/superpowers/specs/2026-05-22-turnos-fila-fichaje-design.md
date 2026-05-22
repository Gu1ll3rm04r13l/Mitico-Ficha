# Diseño: Fichaje por turno-fila (reemplaza emparejado entrada/salida)

**Fecha:** 2026-05-22
**Estado:** Aprobado (pendiente revisión final del usuario)
**Pedido:** Cambiar la modalidad de fichaje. Hoy cada fichaje es un evento suelto
(entrada O salida) y el sistema empareja entrada↔salida con heurística de tiempo +
`enlace_id`. Pasar a un modelo donde **1 fila = 1 turno** con entrada y salida en la
misma fila. El empleado, tras el PIN, ve la tabla de sus turnos del mes; cierra un
turno abierto con un botón `Fichar` en su fila y abre uno nuevo con `Fichar Nueva
Entrada`. Esto elimina todo el emparejado (es manual e implícito en la fila).

---

## Qué logra

- **Elimina el emparejado** entrada↔salida: `emparejarFichajes` (~73 líneas),
  `MAX_TURNO_HORAS`, `getParesMes`, enum `tipo_fichaje`, columna `enlace_id`. Era la
  fuente principal de bugs (el bug grave arreglado el 2026-05-22 fue justo de acá).
- **Liquidación trivial:** cada fila ya tiene entrada+salida → horas = resta directa,
  sin adivinar pares.
- **Cero ambigüedad:** el humano cierra su propia fila. No hay turnos mal apareados.
  Filas huérfanas (sin salida) son responsabilidad del empleado, no error del sistema.
- **Unifica** fichaje del momento y fichaje fuera de horario en un solo diálogo.

---

## Contexto del código actual (lo que se reemplaza)

- `supabase/migrations/0001` — tabla `fichaje.time_records` (1 fila/evento, enum
  `tipo` entrada|salida).
- `0004_registrado_tarde.sql` — flag `registrado_tarde` en time_records.
- `0005_enlace_fichaje.sql` — columna `enlace_id` (auto-referencia para emparejar).
- `lib/fichaje/sueldo.ts` — `emparejarFichajes`, `MAX_TURNO_HORAS`, `calcularPeriodo`,
  `ParFichaje`, `fraccionExtra`, `tarifaParaFecha`, `formatARS`.
- `lib/fichaje/historial.ts` — `getFichajesMes`, `getParesMes`, `rangoMes`, `mesActual`.
- `components/fichaje/FichajeFlow.tsx` — flujo PIN → acción (Entrada/Salida) → jornada/
  extra → cámara.
- `components/empleado/AgregarFichajeTardio.tsx` — modal "Agregar fichaje olvidado".
- `app/api/fichar/route.ts`, `app/api/fichaje-tardio/route.ts`.
- `app/api/cron/cleanup-photos/route.ts` — rotación de 1 foto por fila.
- Lectores: `app/(empleado)/mi-historial/page.tsx`,
  `app/(admin)/admin/empleados/[id]/page.tsx`, galería `components/admin/SelfieGallery.tsx`.
- Seeds: `scripts/seed-empleados.mjs`, `scripts/seed-casos-prueba.mjs`.

---

## Modelo de datos

Nueva tabla `fichaje.turnos` (reemplaza `time_records`). La data actual es de prueba
y descartable, así que la migración hace **drop + create**, sin transformar datos.

```sql
create table fichaje.turnos (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references fichaje.employees(id) on delete cascade,

  tipo_jornada    fichaje.tipo_jornada not null default 'completa',  -- completa | extra
  extra_modo      fichaje.extra_modo,                                -- solo si extra
  nota            text,

  -- Entrada: la fila SIEMPRE nace con entrada (no existe salida huérfana).
  entrada_at      timestamptz not null,
  entrada_foto_url  text,
  entrada_foto_path text,
  entrada_manual  boolean not null default false,   -- true = hora elegida a mano (no "Hora actual")

  -- Salida: null = turno abierto.
  salida_at       timestamptz,
  salida_foto_url   text,
  salida_foto_path  text,
  salida_manual   boolean not null default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index turnos_emp_entrada_idx on fichaje.turnos (employee_id, entrada_at desc);
create index turnos_abiertos_idx    on fichaje.turnos (employee_id) where salida_at is null;
```

Notas de modelo:
- **Turno abierto** = `salida_at IS NULL`. Cualquier fila abierta muestra botón `Fichar`.
- **Selfie siempre** (decisión del usuario, opción A): entrada y salida cada una con su
  foto. La fila guarda 2 fotos.
- **`entrada_manual` / `salida_manual`**: marca que la hora se eligió a mano en vez de
  "Hora actual". Diferencia el fichaje del momento de uno fuera de horario/día, sin un
  concepto separado de "tardío". (No es "editado": no se edita nada, se ficha en otra
  hora.)
- `tipo_jornada` / `extra_modo` / `nota` pertenecen al turno (se eligen al abrir la
  entrada). Sin cambios respecto a hoy.
- Se conservan los enums `tipo_jornada` y `extra_modo`. Se **dropea** el enum
  `tipo_fichaje` (ya no hay filas de tipo entrada/salida).

### Migración (0006)

`supabase/migrations/0006_turnos.sql`:
1. `drop table if exists fichaje.time_records cascade;` (descarta data de prueba +
   columnas de 0004/0005 que vivían ahí).
2. `drop type if exists fichaje.tipo_fichaje;`
3. `create table fichaje.turnos (...)` (arriba) + índices.
4. RLS equivalente a la de `time_records` (misma política de lectura/escritura por
   service role; el cliente no toca la tabla directo, todo pasa por API routes con
   service client — verificar la política actual en `0002` y replicarla).
5. Trigger `updated_at` (reusar `fichaje.set_updated_at`).

Las migraciones 0004 y 0005 quedan obsoletas pero **no se borran** (historial de
migraciones es append-only). 0006 dropea la tabla que ellas alteraban.

---

## Tipos (lib/fichaje/types.ts)

- Borrar `TipoFichaje` y la interface `TimeRecord`.
- Agregar:

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

---

## Flujo del empleado

1. `/fichar` → grilla de empleados (con `PINS_TEST` temporal, ya existente).
2. Tap empleado → `/fichar/[employeeId]` → `PinPad` (crear/ingresar PIN). Verifica PIN
   contra `/api/verificar-pin` (sin cambios).
3. **PIN OK → tabla de turnos del mes** (vista nueva; reemplaza la pantalla
   "Entrada/Salida" de `FichajeFlow`):
   - Filas ordenadas por `entrada_at` desc. Columnas:
     - **Día** (fecha AR de `entrada_at`).
     - **Entrada** — hora (AR) + thumb selfie. Marca visual si `entrada_manual`.
     - **Salida** — si cerrado: hora + thumb. Si abierto: botón **`Fichar`**.
     - **Jornada** — `completa` o `extra (modo)`.
   - Botón inferior **`Fichar Nueva Entrada`** (siempre disponible; sin bloqueo por
     turno abierto — decisión del usuario, opción B).
4. **`Fichar Nueva Entrada`** → si `modalidad === "mixto"`: selector jornada/extra
   (reusar `ExtraSelector`) → **diálogo de fichaje** → `POST /api/turno` crea la fila.
5. **`Fichar`** en fila abierta → **diálogo de fichaje** → `POST /api/turno/[id]/salida`
   setea `salida_at`, `salida_foto_*`, `salida_manual`.

## Diálogo de fichaje (unificado)

Reemplaza el modal "Agregar fichaje olvidado". Componente único usado por entrada-nueva
y por cierre-de-salida.

- Título **"Fichaje"** (sin "olvidado").
- Selector de hora **HH:MM** (24h, 2 selects, como hoy en `AgregarFichajeTardio`).
- Botón **"Hora actual"**: estado por defecto. Un toque fija `now()` y el empleado no
  mira el reloj. Si lo deja en "Hora actual", el fichaje guarda `manual = false`. Si
  elige hora a mano, `manual = true`.
- Para fichaje de día pasado (olvido total): el día también es elegible (igual que hoy
  el modal muestra "DÍA"); por defecto hoy. Se manda el timestamp completo (día+hora) en
  `at`.
- Botón **"Sacar selfie y guardar"** → `CameraCapture` → arma el body y postea.

## API

- **`POST /api/turno`** (nueva entrada):
  `{ employee_id, pin, tipo_jornada, extra_modo, nota, at, manual, foto_base64 }`
  → valida PIN, sube foto a Storage, inserta fila con `entrada_at = at`,
  `entrada_manual = manual`, `salida_at = null`. Devuelve `{ id }`.
- **`POST /api/turno/[id]/salida`** (cerrar):
  `{ pin, at, manual, foto_base64 }`
  → valida PIN + que la fila sea del empleado y esté abierta, sube foto, update
  `salida_at`, `salida_foto_*`, `salida_manual`. Rechaza si ya tiene salida.
- **Borrar** `app/api/fichar/route.ts` y `app/api/fichaje-tardio/route.ts`.
- `/api/set-pin`, `/api/verificar-pin`, `/api/empleado-login/logout`, `/api/registro`
  no cambian.

## Liquidación / sueldo (lib/fichaje/sueldo.ts + historial.ts)

- **Borrar:** `emparejarFichajes`, `MAX_TURNO_HORAS`, `MAX_TURNO_MS`, `ParFichaje`,
  `getParesMes`.
- `getFichajesMes` → `getTurnosMes(employeeId, mes): Turno[]` (filtra por `entrada_at`
  dentro del mes; sin buffer de ±1 día porque el turno completo vive en una fila).
- `calcularPeriodo(turnos, historial, opts)` recibe `Turno[]` directo:
  - `cerrado = salida_at != null`.
  - `horas = salida_at ? horasEntre(entrada_at, salida_at) : null`.
  - `tipo_jornada` / `extra_modo` salen de la fila.
  - Reglas de monto iguales a hoy (día completo cuenta si cerrado; extra por fracción o
    por horas; turno abierto no cuenta). `tarifaParaFecha`, `fraccionExtra`, `formatARS`
    se conservan.
  - `DiaCalculado` se mantiene; `fechaISO` ahora es `diaISOAR(entrada_at)`.
- Lectores `mi-historial` y admin `[id]` consumen `Turno[]` y el resumen recalculado.
  La galería de selfies (`SelfieGallery`) ahora muestra hasta 2 fotos por fila
  (entrada + salida).

## Cron de rotación de fotos (cleanup-photos)

`time_records` tenía 1 foto por fila; `turnos` tiene 2 con edades distintas. Adaptar:
- Borrar `entrada_foto_*` donde `entrada_at < límite (55 días)` y foto no nula.
- Borrar `salida_foto_*` donde `salida_at < límite` y foto no nula.
- Dos barridos (o uno con lógica por columna). Conserva la fila; solo limpia paths/urls.

## Seeds

- `scripts/seed-empleados.mjs`: sin cambios de empleados, pero ya no inserta time_records.
- `scripts/seed-casos-prueba.mjs`: reescribir para insertar filas `turnos` (turno
  cerrado normal, turno abierto, extra por horas, extra fracción, fichaje manual de día
  pasado) en vez de pares entrada/salida.

---

## Fuera de alcance (YAGNI)

- No se bloquea abrir varias entradas con una abierta (decisión: huérfanas = responsa-
  bilidad del empleado).
- No se migran datos viejos (son de prueba).
- No se toca auth, roles, ni panel admin de sueldos/cuentas más allá de leer `turnos`.
- `PINS_TEST` sigue temporal; su borrado es tarea aparte previa a entrega.

## Riesgos / a verificar al implementar

- Replicar exactamente la **RLS** de `time_records` en `turnos` (revisar `0002`).
- Confirmar que `diaISOAR` (TZ Argentina, `lib/fichaje/fechas.ts`) se sigue usando para
  anclar el día — los selects de hora del diálogo arman el timestamp en hora AR.
- Borde de medianoche: con turno-fila el cruce de medianoche ya no parte el turno
  (entrada y salida en la misma fila), así que se puede sacar el buffer ±1 día.
