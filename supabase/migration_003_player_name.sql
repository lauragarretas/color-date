-- Migración: nombre de jugador, para mostrarlo en el revelado junto al
-- nombre del color. Ejecuta esto en el SQL Editor de Supabase.

alter table players add column if not exists player_name text not null default 'Jugador';
