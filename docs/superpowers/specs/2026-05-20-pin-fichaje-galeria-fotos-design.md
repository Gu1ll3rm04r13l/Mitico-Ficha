# PIN al fichar + Galería de fotos del jefe

Fecha: 2026-05-20
Estado: aprobado

## Contexto

Fichero Mítico es una PWA de fichaje con selfie. Hoy el fichaje (`/fichar` →
tocar nombre → selfie → `POST /api/fichar`) **no pide PIN**: cualquiera puede
tocar el nombre de otro y fichar; la selfie queda solo como prueba visual (no hay
reconocimiento facial). El PIN del empleado existe pero solo se usa para ver el
historial propio (`/mi-historial` vía `EmpleadoAuth`), y es **opcional** al alta
(`NuevoEmpleado` permite crear empleado sin PIN).

Este spec cubre dos features:

1. **PIN obligatorio al fichar** — el mismo PIN que usa el empleado para entrar a
   ver su historial.
2. **Galería de fotos para el jefe** — grilla de selfies de un empleado con modal
   de detalle.

## Modelo de seguridad (política, no código)

El PIN no busca volver imposible que un empleado fiche por otro. Busca que sea
**deliberado**, no accidental: nadie ficha por otro "sin querer" tocando un
nombre equivocado. Si alguien ficha por otro, tuvo que conocer su PIN.

- El **PIN es individual**. A los empleados se les comunica que no deben
  compartirlo. Si lo comparten y se fichan entre ellos, hay consecuencias.
- La capa real de rendición de cuentas son **las fotos**, no el PIN. Cada
  fichaje guarda una selfie.
- Las fotos se conservan **55 días** y luego se borran del storage; el registro
  del fichaje (fila) se conserva siempre, solo se le quita la referencia a la
  foto. Lo maneja el cron `api/cron/cleanup-photos` (hoy `DIAS = 50` → se sube a
  `55`). 55 días cubre el ciclo: se paga el mes anterior ~día 5-10 del mes
  siguiente, así que la foto del día 1 vive ~35-40 días con margen antes del
  borrado.
- **Cada mes, al pagar**, el jefe revisa todas las fotos del período (de ahí la
  galería de la Feature 2).
- Si una foto no es de quien dice fichar, o es del piso/techo/cualquier cosa que
  no sea la persona, hay reclamo/consecuencia en la vida real entre jefe y
  empleado. El sistema no lo bloquea automáticamente: lo deja en evidencia.

En resumen: PIN = barrera contra el error y el fichaje casual por otro; fotos =
prueba para la revisión humana mensual. No hay reconocimiento facial.

## Feature 1 — PIN al fichar

### Flujo

```
/fichar  →  tocar nombre  →  /fichar/[employeeId]
         →  PinPad (ingresar o crear PIN)
         →  elegir Entrada/Salida
         →  selfie
         →  POST /api/fichar  →  ✓
```

El PIN es la primera barrera, justo después de tocar el nombre y antes de elegir
Entrada/Salida.

### Manejo de empleados sin PIN

Decisión: **el PIN se crea en el primer fichaje**. No se vuelve obligatorio al
alta (sigue opcional en `NuevoEmpleado`).

- Empleado **con** `pin_hash` → PinPad en modo "Ingresá tu PIN".
- Empleado **sin** `pin_hash` → PinPad en modo "Creá tu PIN": escribir PIN +
  confirmarlo. Ese request lo guarda y queda como PIN definitivo para fichajes y
  para login de historial.

### Componente nuevo: `PinPad`

`components/fichaje/PinPad.tsx` (client).

- Teclado numérico con botones grandes (modo celular): dígitos 0-9, borrar,
  confirmar. Indicador de dígitos ingresados (puntos).
- Props: `modo: "ingresar" | "crear"`, callbacks `onSubmit(pin)` /
  `onConfirmar(pin)` y `onCancel`.
- Modo "crear": dos pasos internos (PIN + repetir PIN); valida que coincidan
  (4-8 dígitos) antes de emitir.
- Muestra error de PIN incorrecto / bloqueo recibido del server.

### Cambios en `FichajeFlow`

`components/fichaje/FichajeFlow.tsx`.

- Nuevo paso inicial `"pin"` en el tipo `Paso`. El flujo arranca en `"pin"`, no
  en `"accion"`.
- Recibe nueva prop `tienePin: boolean` para elegir el modo del PinPad.
- Tras validar/crear el PIN, guarda el PIN en estado local (no se persiste en
  cliente más allá del flujo) y avanza a `"accion"`.
- El PIN ingresado se envía en el `POST /api/fichar` junto con el resto del body.

### Cambios en la página `/fichar/[employeeId]`

`app/(publico)/fichar/[employeeId]/page.tsx`.

- La query del empleado debe exponer si tiene PIN. Se deriva un booleano
  `tienePin = !!empleado.pin_hash` en el server y se pasa a `FichajeFlow`.
- **Nunca** se envía `pin_hash` al cliente, solo el booleano.

### Cambios en `getEmpleado` / queries

`lib/fichaje/queries.ts`.

- `getEmpleado` ya hace `select("*")`, así que `pin_hash` está disponible
  server-side. La página deriva `tienePin` y NO pasa el hash al componente
  cliente. No hace falta cambiar la query, solo el uso.

### Cambios en `POST /api/fichar`

`app/api/fichar/route.ts`.

- Agregar `pin: z.string().min(4).max(8)` al schema de entrada.
- Tras validar empleado activo, traer también `pin_hash` en el select del
  empleado.
- Lógica:
  - Si el empleado **tiene** `pin_hash`: verificar con `verificarPin(pin, hash)`.
    Si falla → `401 { error: "PIN incorrecto" }` y **no** se ficha.
  - Si el empleado **no tiene** `pin_hash`: validar `pinValido(pin)`; si es
    válido, `hashPin(pin)` y `UPDATE employees SET pin_hash = ...`. Luego seguir
    con el fichaje. Si es inválido → `400`.
- **Lockout** por intentos de PIN fallidos: replicar el patrón de
  `empleado-login` (mapa en memoria, 5 fallos → bloqueo 5 min por
  `employee_id`). Si está bloqueado → `429`. Resetear contador al acertar.
- El rate limit de fichaje existente (1 cada 60s) se mantiene **después** de
  validar el PIN, para no consumir el cupo en intentos fallidos de PIN.

### Seguridad

- La validación del PIN es **server-side**; el cliente no puede saltearla.
- El hash nunca sale del server.
- Lockout evita fuerza bruta de PIN.

## Feature 2 — Galería de fotos del jefe

### Ubicación

Sección nueva **"Fotos del mes"** dentro de
`app/(admin)/admin/empleados/[id]/page.tsx`, debajo del bloque de período /
tabla. Reutiliza los `registros` del mes y las URLs firmadas (`firmadas`) que la
página **ya calcula**: cero queries o firmas adicionales.

### Componente nuevo: `SelfieGallery`

`components/admin/SelfieGallery.tsx` (client).

- **Props:** array de items con `{ url: string | null, timestamp: string,
  tipo: "entrada" | "salida", tipoJornada, extraModo, nota }` + datos del
  empleado (`nombre`, `apellido`, `rol`).
- **Grilla** responsive de miniaturas (todas las selfies del mes que tengan
  `foto_path` firmado). Cada miniatura: imagen cuadrada + hora + badge
  Entrada/Salida. Items sin foto (archivada por rotación) se omiten de la
  galería.
- **Modal** al hacer click en una miniatura:
  - Animación fade + scale al abrir/cerrar.
  - Imagen grande a la izquierda; panel de detalles a la derecha con:
    - Empleado + puesto (`nombre apellido` — `rol`)
    - Fecha y hora exacta (ej. "Lun 19 may, 14:32", `date-fns` + locale `es`)
    - Tipo de fichaje (Entrada/Salida + jornada completa / extra)
    - Nota (si existe; si no, se omite la fila)
  - Cerrar con click en backdrop o tecla `Esc`.
  - Flechas ‹ › (UI + teclas izquierda/derecha) para navegar entre fotos sin
    cerrar el modal.
  - En mobile, el panel de detalles se apila debajo de la imagen.

### Relación con lo existente

- La tabla de período y sus `SelfieThumb` quedan **sin cambios**. La galería es
  una sección adicional.

## Componentes / archivos afectados

**Nuevos:**
- `components/fichaje/PinPad.tsx`
- `components/admin/SelfieGallery.tsx`

**Modificados:**
- `components/fichaje/FichajeFlow.tsx` (paso `pin`, prop `tienePin`, enviar PIN)
- `app/(publico)/fichar/[employeeId]/page.tsx` (derivar y pasar `tienePin`)
- `app/api/fichar/route.ts` (schema con `pin`, verificación/creación de PIN,
  lockout)
- `app/(admin)/admin/empleados/[id]/page.tsx` (montar `SelfieGallery` con los
  datos ya disponibles)
- `app/api/cron/cleanup-photos/route.ts` (`DIAS = 50` → `55`)

**Sin cambios:** `lib/fichaje/pin.ts` (ya expone `hashPin`, `verificarPin`,
`pinValido`), `lib/fichaje/queries.ts`, `EmpleadoAuth`, `SelfieThumb`,
`NuevoEmpleado`.

## Fuera de alcance (YAGNI)

- Reconocimiento facial / validación de que la foto sea una cara.
- Hacer el PIN obligatorio en el alta de empleado.
- Cambiar el login de historial (`EmpleadoAuth`) — sigue igual.
- Descarga / exportación de fotos.

## Criterios de aceptación

1. Tocar un nombre en `/fichar` lleva al PinPad antes de poder elegir
   Entrada/Salida.
2. Empleado con PIN: PIN correcto avanza; PIN incorrecto muestra error y no
   ficha; 5 fallos bloquean temporalmente.
3. Empleado sin PIN: se le pide crear y confirmar PIN; queda guardado y sirve
   tanto para fichar como para entrar a `/mi-historial`.
4. El fichaje solo se inserta si el PIN fue validado/creado server-side.
5. En la ficha del empleado (admin), aparece la grilla "Fotos del mes" con las
   selfies del mes seleccionado.
6. Click en una foto abre un modal animado con la imagen grande y los detalles
   (empleado+puesto, fecha/hora, tipo, nota); se navega con flechas y se cierra
   con Esc / click afuera.
