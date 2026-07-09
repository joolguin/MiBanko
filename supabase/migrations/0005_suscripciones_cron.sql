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
