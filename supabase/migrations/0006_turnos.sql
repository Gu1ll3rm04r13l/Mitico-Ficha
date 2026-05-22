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
