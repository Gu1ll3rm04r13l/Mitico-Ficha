-- =====================================================================
-- Fichero Mítico — 0004 fichaje tardío
-- Marca los fichajes que el empleado cargó en otro momento (olvido de
-- entrada/salida), desde su propio historial. El jefe los ve distinguidos.
-- =====================================================================

alter table fichaje.time_records
  add column if not exists registrado_tarde boolean not null default false;

comment on column fichaje.time_records.registrado_tarde is
  'true = el empleado lo cargó en otro momento desde su historial (fichaje tardío). Marcado para revisión del jefe.';
