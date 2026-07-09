-- Sub-fase 3a: suscripciones fijas auto-registradas por cron.
-- fixed_subscriptions y su RLS ya existen desde 0001/0002; aquí solo el vínculo,
-- la idempotencia, la RPC de cobro y el schedule de pg_cron.

-- 1. Vínculo transacción -> suscripción (analítica + idempotencia).
alter table public.transactions
  add column if not exists subscription_id uuid
    references public.fixed_subscriptions(id) on delete set null;

-- 2. Un único cobro por suscripción por mes calendario.
create unique index if not exists uq_tx_subscription_month
  on public.transactions (subscription_id, (date_trunc('month', transaction_date::timestamp)))
  where subscription_id is not null;

-- 3. Cobro idempotente. Llamada por pg_cron (sin sesión -> todas las usuarias)
--    y por la app (con sesión -> solo la usuaria actual). Devuelve #cobros creados.
create or replace function public.run_due_subscriptions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_hoy    date := (now() at time zone 'America/Santiago')::date;
  v_dia    int  := extract(day from v_hoy)::int;
  v_bice   uuid;
  v_count  int  := 0;
  v_ins    int;
  sub      record;
begin
  for sub in
    select s.*
    from public.fixed_subscriptions s
    where s.is_active = true
      and s.charge_day_of_month = v_dia
      and (v_caller is null or s.user_id = v_caller)
  loop
    select a.id into v_bice
    from public.accounts a
    where a.user_id = sub.user_id and a.type = 'credit'
    limit 1;

    if v_bice is null then
      continue;
    end if;

    insert into public.transactions
      (user_id, account_id, type, amount, transaction_date, channel,
       category_id, description, source, billing_cycle_id, subscription_id)
    values
      (sub.user_id, v_bice, 'gasto', sub.amount, v_hoy, sub.channel,
       sub.category_id, sub.name, 'auto', null, sub.id)
    on conflict (subscription_id, (date_trunc('month', transaction_date::timestamp)))
      where subscription_id is not null
    do nothing;

    get diagnostics v_ins = row_count;
    v_count := v_count + v_ins;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.run_due_subscriptions() to authenticated;
