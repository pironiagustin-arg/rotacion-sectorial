-- Screener: correr una vez en Supabase > SQL Editor.

-- Último dato de cada acción (lo escribe /api/sync con la service key; lectura pública)
create table if not exists snapshots (
  symbol text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Foto diaria para ver la evolución de métricas y score contra su propio historial
create table if not exists snapshot_history (
  symbol text not null,
  day date not null,
  data jsonb not null,
  primary key (symbol, day)
);

-- Tus ediciones: precio justo, tipo Lynch, notas, correcciones de métricas y ajustes
create table if not exists overrides (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  symbol text not null,
  fair_value numeric,
  lynch_type text,
  notes text,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table snapshots enable row level security;
alter table snapshot_history enable row level security;
alter table overrides enable row level security;

drop policy if exists "snapshots lectura" on snapshots;
create policy "snapshots lectura" on snapshots for select using (true);
drop policy if exists "historial lectura" on snapshot_history;
create policy "historial lectura" on snapshot_history for select using (true);

drop policy if exists "overrides dueño" on overrides;
create policy "overrides dueño" on overrides for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
