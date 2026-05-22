-- =====================================================================
-- Fichero Mítico — 0002 RLS
-- Helpers SECURITY DEFINER (evitan recursión de policies sobre app_users)
-- + políticas por tabla.
-- =====================================================================

-- ---------- Helpers ----------
-- SECURITY DEFINER: corren con privilegios del owner, saltean RLS al leer app_users.
create or replace function fichaje.rol_actual()
returns fichaje.rol_app
language sql stable security definer set search_path = fichaje, public as $$
  select rol from fichaje.app_users where user_id = auth.uid();
$$;

create or replace function fichaje.es_staff()
returns boolean
language sql stable security definer set search_path = fichaje, public as $$
  select coalesce(
    (select rol in ('admin','jefe','encargado') from fichaje.app_users where user_id = auth.uid()),
    false
  );
$$;

create or replace function fichaje.es_admin()
returns boolean
language sql stable security definer set search_path = fichaje, public as $$
  select coalesce(
    (select rol = 'admin' from fichaje.app_users where user_id = auth.uid()),
    false
  );
$$;

-- ---------- Habilitar RLS ----------
alter table fichaje.employees      enable row level security;
alter table fichaje.salary_history enable row level security;
alter table fichaje.time_records   enable row level security;
alter table fichaje.app_users      enable row level security;
alter table fichaje.app_config     enable row level security;

-- ---------- employees ----------
-- Staff: CRUD completo.
create policy employees_staff_all on fichaje.employees
  for all to authenticated
  using (fichaje.es_staff()) with check (fichaje.es_staff());

-- Empleado con cuenta Auth (raro): solo SELECT de su propia fila.
create policy employees_self_select on fichaje.employees
  for select to authenticated
  using (user_id = auth.uid());

-- Auto-registro: cualquiera autenticado puede crear UNA fila de empleado
-- (sin sueldo). El service role del endpoint de registro PIN no pasa por RLS.
-- Se deja a anon para el flujo de registro público controlado por el route handler.

-- ---------- salary_history (solo staff; empleado nunca ve plata) ----------
create policy salary_staff_all on fichaje.salary_history
  for all to authenticated
  using (fichaje.es_staff()) with check (fichaje.es_staff());

-- ---------- time_records ----------
-- Staff: CRUD completo.
create policy time_staff_all on fichaje.time_records
  for all to authenticated
  using (fichaje.es_staff()) with check (fichaje.es_staff());

-- Empleado con cuenta Auth: SELECT de los propios (vía employees.user_id).
create policy time_self_select on fichaje.time_records
  for select to authenticated
  using (
    exists (
      select 1 from fichaje.employees e
      where e.id = time_records.employee_id and e.user_id = auth.uid()
    )
  );

-- Inserción de fichajes desde el celular del local NO pasa por RLS:
-- la Edge Function / route handler usa service role (bypassa RLS).

-- ---------- app_users ----------
-- El propio usuario lee su fila.
create policy appusers_self_select on fichaje.app_users
  for select to authenticated
  using (user_id = auth.uid());

-- Staff lee todas (para gestión de cuentas).
create policy appusers_staff_select on fichaje.app_users
  for select to authenticated
  using (fichaje.es_staff());

-- Solo admin puede INSERT / UPDATE / DELETE (cambiar o asignar roles).
create policy appusers_admin_insert on fichaje.app_users
  for insert to authenticated
  with check (fichaje.es_admin());

create policy appusers_admin_update on fichaje.app_users
  for update to authenticated
  using (fichaje.es_admin()) with check (fichaje.es_admin());

create policy appusers_admin_delete on fichaje.app_users
  for delete to authenticated
  using (fichaje.es_admin());

-- ---------- app_config ----------
-- Staff lee; solo admin escribe.
create policy appconfig_staff_select on fichaje.app_config
  for select to authenticated
  using (fichaje.es_staff());

create policy appconfig_admin_write on fichaje.app_config
  for all to authenticated
  using (fichaje.es_admin()) with check (fichaje.es_admin());
