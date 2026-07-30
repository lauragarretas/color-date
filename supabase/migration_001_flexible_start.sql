-- Migración: el contador de 24h ahora arranca cuando se une el segundo
-- jugador, no al crear la partida. Ejecuta esto en el SQL Editor de tu
-- proyecto Supabase (solo hace falta una vez, ya que ya ejecutaste el
-- schema.sql original).

alter table games rename column started_at to created_at;
alter table games alter column created_at set default now();
alter table games add column started_at timestamptz;
alter table games alter column ends_at drop not null;
alter table games drop constraint if exists games_photo_limit_check;
alter table games add constraint games_photo_limit_check check (photo_limit > 0 and photo_limit <= 30);
