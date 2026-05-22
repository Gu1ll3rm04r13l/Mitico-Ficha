-- =====================================================================
-- Fichero Mítico — 0001 schema fichaje
-- Crea schema aislado `fichaje`. NO toca `public` (donde vive la carta).
-- =====================================================================

create schema if not exists fichaje;

-- ---------- Enums ----------
create type fichaje.modalidad_pago as enum ('jornada', 'horas', 'mixto');
create type fichaje.tipo_fichaje   as enum ('entrada', 'salida');
create type fichaje.tipo_jornada   as enum ('completa', 'extra');
create type fichaje.extra_modo     as enum ('cuarto', 'medio', 'completo', 'horas');
create type fichaje.rol_app        as enum ('admin', 'jefe', 'encargado', 'empleado');

-- ---------- Empleados ----------
create table fichaje.employees (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  apellido               text,
  rol                    text,                                  -- mozo, cocinero, pizzero, barra, etc.
  modalidad_pago         fichaje.modalidad_pago not null default 'jornada',
  sueldo_mensual         numeric(10,2),
  sueldo_diario_override numeric(10,2),
  tarifa_hora_override   numeric(10,2),
  horas_jornada_estandar numeric(4,2) not null default 8.0,
  pin_hash               text,                                  -- PIN hasheado (bcrypt) para login del empleado
  activo                 boolean not null default true,
  user_id                uuid references auth.users(id) on delete set null, -- solo staff con cuenta Auth
  foto_perfil_url        text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index employees_activo_idx on fichaje.employees (activo);

-- ---------- Historial de sueldos (cálculos retroactivos estables) ----------
create table fichaje.salary_history (
  id                     uuid primary key default gen_random_uuid(),
  employee_id            uuid not null references fichaje.employees(id) on delete cascade,
  sueldo_mensual         numeric(10,2),
  sueldo_diario_override numeric(10,2),
  tarifa_hora_override   numeric(10,2),
  horas_jornada_estandar numeric(4,2) not null default 8.0,
  vigente_desde          date not null,
  created_at             timestamptz not null default now()
);

create index salary_history_emp_vig_idx on fichaje.salary_history (employee_id, vigente_desde desc);

-- ---------- Fichajes ----------
create table fichaje.time_records (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references fichaje.employees(id) on delete cascade,
  tipo         fichaje.tipo_fichaje not null,
  tipo_jornada fichaje.tipo_jornada not null default 'completa',
  extra_modo   fichaje.extra_modo,                  -- solo si tipo_jornada='extra'
  nota         text,
  "timestamp"  timestamptz not null default now(),
  foto_url     text,
  foto_path    text,                                -- path en Storage (nullable: rotación limpia foto, conserva registro)
  created_at   timestamptz not null default now()
);

create index time_records_emp_ts_idx on fichaje.time_records (employee_id, "timestamp" desc);
create index time_records_ts_idx     on fichaje.time_records ("timestamp");

-- ---------- Cuentas de app (rol elevado mapeado a auth.users) ----------
create table fichaje.app_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  rol         fichaje.rol_app not null default 'empleado',
  employee_id uuid references fichaje.employees(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- Configuración global (fracciones EXTRA editables desde el panel) ----------
create table fichaje.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Defaults de fracciones del EXTRA (editables desde /admin)
insert into fichaje.app_config (key, value) values
  ('extra_fracciones', '{"cuarto": 0.25, "medio": 0.5, "completo": 1.0}'::jsonb);

-- ---------- trigger updated_at en employees ----------
create or replace function fichaje.set_updated_at()
returns trigger language plpgsql
set search_path = fichaje, public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger employees_set_updated_at
  before update on fichaje.employees
  for each row execute function fichaje.set_updated_at();
