# Fichero Mítico

PWA de control de asistencia para **Mítico** (Pizzería & Cocktail Bar, Miramar).
Empleados fichan entrada/salida con selfie desde el celular del local; el panel
admin calcula sueldos; cada empleado ve solo su historial.

Stack: Next.js 15 (App Router) · TypeScript estricto · Supabase (Postgres + Auth +
Storage + RLS) · Tailwind v4 · PWA (Serwist). Deploy en Vercel.

---

## Puesta en marcha (local)

1. **Completar el service role key** en `.env.local`:
   - Supabase Dashboard → Project Settings → API → `service_role` (secret).
   - Pegarlo en `SUPABASE_SERVICE_ROLE_KEY=` (reemplaza `PEGAR_SERVICE_ROLE_KEY_ACA`).
   - El resto de variables ya está cargado (URL, anon key, secretos generados).

2. **Crear el admin master** (una sola vez):
   ```bash
   node scripts/seed-admin.mjs arieldelfresno2690@gmail.com TU_CONTRASEÑA
   ```
   Crea la cuenta Auth y la marca como `admin` en `fichaje.app_users`.

3. **Levantar la app:**
   ```bash
   npm run dev
   ```
   - `/fichar` → grilla de empleados (celular del local, sin login).
   - `/login` → panel admin (email/password del admin).
   - `/registro` o `/mi-historial` → acceso del empleado por nombre + PIN.

---

## Flujos

- **Fichaje** (`/fichar`): tocar nombre → Entrada/Salida → (si es mixto: jornada/extra)
  → selfie → confirmar. Inserción vía `/api/fichar` con service role + rate limit 60s.
- **Admin** (`/admin`): dashboard, CRUD de empleados, configuración de sueldo
  (modalidad + mensual + overrides → `salary_history`), detalle del período con
  fotos y cálculo de liquidación (toggle "Incluir extras"), gestión de cuentas
  (cambiar roles = solo admin).
- **Empleado** (`/mi-historial`): solo lectura del propio historial. Sin sueldos.

## Modelo de sueldo

`tarifa_diaria = sueldo_mensual / 30` (o override) ·
`tarifa_horaria = tarifa_diaria / horas_jornada` (o override).
Día `completa` = 1 tarifa diaria. `extra`: cuarto/medio/completo (fracción del día,
**editable en `/admin`**) u `horas` (horas reales × tarifa horaria). Las tarifas se
resuelven por día contra `salary_history`.

## Roles

`admin` (master, único que cambia roles) > `jefe` / `encargado` (gestionan
empleados/sueldos/fichajes) > `empleado` (solo su historial). Auto-registro nace
como `empleado`.

## Base de datos

Schema aislado `fichaje` (no toca `public.menu_items`, la carta). Migraciones en
`supabase/migrations/`. RLS en las 5 tablas; bucket `fichaje-selfies` privado
(solo URLs firmadas). Rotación de fotos >50 días vía `/api/cron/cleanup-photos`
(Vercel Cron diario, ver `vercel.json`).

## Deploy en Vercel

Cargar las mismas variables de entorno en el proyecto Vercel (incluido
`CRON_SECRET`, que Vercel Cron usa como Bearer). El cron de rotación queda
configurado por `vercel.json`.
