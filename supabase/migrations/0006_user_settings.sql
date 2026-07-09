-- Sub-fase 3c: preferencias de la usuaria. Singleton por usuaria (patrón bice_config).
create table if not exists public.user_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  fresh_limit_days int not null default 4 check (fresh_limit_days between 1 and 60),
  updated_at       timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists user_settings_owner on public.user_settings;
create policy user_settings_owner on public.user_settings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
