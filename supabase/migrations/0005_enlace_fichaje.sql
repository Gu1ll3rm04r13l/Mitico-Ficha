-- =====================================================================
-- Fichero Mítico — 0005 enlace explícito entre fichajes
-- Cuando el empleado completa un hueco puntual (+Fichar en una fila), el
-- nuevo registro queda atado al hermano que cierra/abre vía enlace_id.
-- El emparejado respeta este vínculo antes que la heurística por tiempo,
-- permitiendo cerrar turnos largos o cargados días después sin ambigüedad.
-- =====================================================================

alter table fichaje.time_records
  add column if not exists enlace_id uuid
    references fichaje.time_records(id) on delete set null;

comment on column fichaje.time_records.enlace_id is
  'Registro hermano (entrada<->salida) al que este fichaje se ata explícitamente cuando se completa un hueco puntual. El emparejado lo respeta antes que la heurística por tiempo.';

create index if not exists time_records_enlace_idx
  on fichaje.time_records (enlace_id);
