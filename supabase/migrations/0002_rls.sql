-- MiBanko — Row Level Security
-- Usuaria única, pero el modelo es multi-usuario-seguro: cada fila pertenece a su user_id
-- y solo el dueño autenticado puede leerla/escribirla. La anon key puede vivir en el
-- frontend sin riesgo porque nadie ve datos ajenos aunque tenga la URL del proyecto.

alter table public.accounts            enable row level security;
alter table public.categories          enable row level security;
alter table public.bice_billing_cycles enable row level security;
alter table public.balance_snapshots   enable row level security;
alter table public.transactions        enable row level security;
alter table public.fixed_subscriptions enable row level security;

drop policy if exists accounts_owner   on public.accounts;
create policy accounts_owner   on public.accounts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists categories_owner on public.categories;
create policy categories_owner on public.categories
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists cycles_owner     on public.bice_billing_cycles;
create policy cycles_owner     on public.bice_billing_cycles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists snapshots_owner  on public.balance_snapshots;
create policy snapshots_owner  on public.balance_snapshots
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists transactions_owner on public.transactions;
create policy transactions_owner on public.transactions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists subscriptions_owner on public.fixed_subscriptions;
create policy subscriptions_owner on public.fixed_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
