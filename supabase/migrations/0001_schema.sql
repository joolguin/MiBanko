-- MiBanko — Esquema base (v1)
-- Moneda: CLP sin decimales => numeric(12,0)
-- Todas las tablas llevan user_id (RLS en 0002).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('debit','credit','investment')),
  bank       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories  (nombre único por usuario)
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- bice_billing_cycles  (la boleta manda: billed_amount es la fuente de verdad)
-- ---------------------------------------------------------------------------
create table if not exists public.bice_billing_cycles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cycle_start   date not null,
  cycle_end     date not null,
  due_date      date not null,
  billed_amount numeric(12,0) not null default 0,
  is_paid       boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- balance_snapshots  (regla de app: solo cuentas debit/investment)
-- ---------------------------------------------------------------------------
create table if not exists public.balance_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  balance       numeric(12,0) not null,
  snapshot_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id       uuid not null references public.accounts(id) on delete cascade,
  type             text not null check (type in ('ingreso','gasto','pago_tarjeta','transferencia_interna')),
  amount           numeric(12,0) not null,
  transaction_date date not null default current_date,
  channel          text check (channel in ('tarjeta_fisica','wallet_pixel','transferencia_app','onepay','otro')),
  category_id      uuid references public.categories(id) on delete set null,
  description      text,
  billing_cycle_id uuid references public.bice_billing_cycles(id) on delete set null,
  source           text not null default 'manual' check (source in ('manual','auto')),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- fixed_subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.fixed_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name                text not null,
  amount              numeric(12,0) not null,
  charge_day_of_month int not null check (charge_day_of_month between 1 and 28),
  category_id         uuid references public.categories(id) on delete set null,
  channel             text not null default 'wallet_pixel',
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- índices
-- ---------------------------------------------------------------------------
create index if not exists idx_transactions_user           on public.transactions(user_id);
create index if not exists idx_transactions_account_date    on public.transactions(account_id, transaction_date);
create index if not exists idx_transactions_billing_cycle   on public.transactions(billing_cycle_id);
create index if not exists idx_snapshots_account_date       on public.balance_snapshots(account_id, snapshot_date desc);
create index if not exists idx_snapshots_user               on public.balance_snapshots(user_id);
create index if not exists idx_cycles_user_unpaid           on public.bice_billing_cycles(user_id) where is_paid = false;
