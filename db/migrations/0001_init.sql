-- Msingi initial schema (Neon Postgres).
-- Saved calculations, one row per record, owned by a Neon Auth user.
--
-- Access is only ever through the app's server routes (app/api/calculations),
-- which scope every query to the signed-in user's id. There is no Row Level
-- Security because the browser never talks to the database directly.
--
-- Apply with the Neon SQL editor, `psql "$DATABASE_URL" -f db/migrations/0001_init.sql`,
-- or any migration runner. Neon Auth must be enabled first (it creates neon_auth."user").

create table if not exists public.saved_calculations (
  id uuid primary key,
  user_id uuid not null references neon_auth."user" (id) on delete cascade,
  tool_slug text not null,
  title text not null,
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_calculations_user_created_idx
  on public.saved_calculations (user_id, created_at desc);
