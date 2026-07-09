-- Sub-fase 3b-i: historial diario del SLRD.
-- Snapshotea la vista v_slrd (valor actual) en una fila por usuaria por día.
-- Mismo patrón que run_due_subscriptions (0005): security definer, dual-mode
-- (cron sin sesión = todas; app con sesión = solo la usuaria), idempotente por día.

-- 1. Tabla: una fila por usuaria por día con el desglose completo del SLRD.
create table if not exists public.slrd_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  snapshot_date      date not null,
  slrd_inmediato     numeric not null,
  slrd_total         numeric not null,
  saldo_contable     numeric not null,
  saldo_debito       numeric not null,
  saldo_inversion    numeric not null,
  deuda_facturada    numeric not null,
  deuda_no_facturada numeric not null,
  created_at         timestamptz not null default now()
);

-- 2. Idempotencia por día: un único snapshot por usuaria por fecha.
create unique index if not exists uq_slrd_history_user_day
  on public.slrd_history (user_id, snapshot_date);

-- 3. RLS: cada quien ve/escribe solo lo suyo. La RPC es security definer,
--    así que el cron sin sesión igual escribe.
alter table public.slrd_history enable row level security;
drop policy if exists slrd_history_owner on public.slrd_history;
create policy slrd_history_owner on public.slrd_history
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Snapshot idempotente. Dual-mode: sin sesión (cron) recorre todas las usuarias;
--    con sesión (app) solo la usuaria actual. Upsert: la última llamada del día gana.
--    Devuelve # de filas afectadas.
create or replace function public.snapshot_slrd()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_hoy    date := (now() at time zone 'America/Santiago')::date;
  v_count  int  := 0;
begin
  insert into public.slrd_history
    (user_id, snapshot_date, slrd_inmediato, slrd_total, saldo_contable,
     saldo_debito, saldo_inversion, deuda_facturada, deuda_no_facturada)
  select
    v.user_id, v_hoy, v.slrd_inmediato, v.slrd_total, v.saldo_contable,
    v.saldo_debito, v.saldo_inversion, v.deuda_facturada, v.deuda_no_facturada
  from public.v_slrd v
  where v_caller is null or v.user_id = v_caller
  on conflict (user_id, snapshot_date) do update set
    slrd_inmediato     = excluded.slrd_inmediato,
    slrd_total         = excluded.slrd_total,
    saldo_contable     = excluded.saldo_contable,
    saldo_debito       = excluded.saldo_debito,
    saldo_inversion    = excluded.saldo_inversion,
    deuda_facturada    = excluded.deuda_facturada,
    deuda_no_facturada = excluded.deuda_no_facturada,
    created_at         = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.snapshot_slrd() to authenticated;

-- 5. Cron diario. 09:10 UTC: 10 min después de run-due-subscriptions (0 9 * * *)
--    para que el snapshot del día ya refleje las suscripciones auto-cargadas.
create extension if not exists pg_cron;

-- idempotente: desprograma un job previo con el mismo nombre antes de crearlo.
select cron.unschedule(jobid) from cron.job where jobname = 'snapshot-slrd';
select cron.schedule('snapshot-slrd', '10 9 * * *',
  $$select public.snapshot_slrd();$$);
