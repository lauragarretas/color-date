-- Color Date · esquema de base de datos
-- Pega esto en Supabase > SQL Editor > New query > Run

create extension if not exists "pgcrypto";

create table if not exists games (
  code text primary key,
  photo_limit integer not null check (photo_limit > 0 and photo_limit <= 30),
  created_at timestamptz not null default now(),
  started_at timestamptz, -- se rellena cuando se une el segundo jugador
  ends_at timestamptz     -- created_at + 24h, fijado en ese mismo momento
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references games(code) on delete cascade,
  slot integer not null check (slot in (1, 2)),
  device_id text not null,
  player_name text not null default 'Jugador',
  color_hex text not null,
  color_name text not null,
  joined_at timestamptz not null default now(),
  unique (game_code, slot)
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references games(code) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  storage_path text not null,
  avg_color_hex text not null,
  similarity numeric not null check (similarity >= 0 and similarity <= 100),
  created_at timestamptz not null default now()
);

create index if not exists photos_game_idx on photos(game_code);
create index if not exists players_game_idx on players(game_code);

-- RLS: acceso abierto vía anon key, protegido solo por lo impredecible
-- del código de partida (8 caracteres aleatorios). Adecuado para uso
-- personal, no para datos sensibles de verdad. Ver README para más detalle.
alter table games enable row level security;
alter table players enable row level security;
alter table photos enable row level security;

create policy "anon full access games" on games
  for all using (true) with check (true);
create policy "anon full access players" on players
  for all using (true) with check (true);
create policy "anon full access photos" on photos
  for all using (true) with check (true);

-- Después de ejecutar esto, crea manualmente un bucket de Storage:
-- Storage > New bucket > name: "photos" > Public bucket: ON
