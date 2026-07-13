-- Msingi initial schema.
-- Saved calculations, one row per record, owned by the signed-in user.
-- Apply with: supabase db push, or paste into the Supabase SQL editor.

create table if not exists public.saved_calculations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool_slug text not null,
  title text not null,
  inputs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_calculations_user_created_idx
  on public.saved_calculations (user_id, created_at desc);

alter table public.saved_calculations enable row level security;

-- Owners can do everything with their own rows; nobody sees anyone else's.
create policy "saved_calculations_select_own"
  on public.saved_calculations for select
  using (auth.uid() = user_id);

create policy "saved_calculations_insert_own"
  on public.saved_calculations for insert
  with check (auth.uid() = user_id);

create policy "saved_calculations_update_own"
  on public.saved_calculations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "saved_calculations_delete_own"
  on public.saved_calculations for delete
  using (auth.uid() = user_id);
