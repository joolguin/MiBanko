-- MiBanko — Vistas del SLRD
-- security_invoker = true  => la vista se ejecuta con los permisos del usuario que consulta,
-- por lo que la RLS de las tablas base se aplica y cada quien ve solo lo suyo.

-- Último snapshot por cuenta (el más reciente por snapshot_date).
create or replace view public.v_latest_snapshots
with (security_invoker = true) as
select distinct on (bs.account_id)
  bs.account_id,
  bs.user_id,
  a.type   as account_type,
  bs.balance,
  bs.snapshot_date
from public.balance_snapshots bs
join public.accounts a on a.id = bs.account_id
order by bs.account_id, bs.snapshot_date desc, bs.id desc;

-- SLRD por usuario (una fila).
--   saldo_debito        = Σ último_snapshot de cuentas debit      (Santander)
--   saldo_inversion     = Σ último_snapshot de cuentas investment (Fintual)
--   deuda_no_facturada  = Σ gastos BICE (credit) con billing_cycle_id null
--   deuda_facturada     = Σ billed_amount de ciclos no pagados
--   slrd_inmediato      = saldo_debito − deuda_facturada − deuda_no_facturada
--   slrd_total          = slrd_inmediato + saldo_inversion
--   saldo_contable      = saldo_debito + saldo_inversion   (el número "mentiroso")
create or replace view public.v_slrd
with (security_invoker = true) as
with usr as (
  select distinct user_id from public.accounts
),
snap as (
  select
    user_id,
    coalesce(sum(balance) filter (where account_type = 'debit'), 0)      as saldo_debito,
    coalesce(sum(balance) filter (where account_type = 'investment'), 0) as saldo_inversion
  from public.v_latest_snapshots
  group by user_id
),
no_fact as (
  select t.user_id, coalesce(sum(t.amount), 0) as deuda_no_facturada
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where a.type = 'credit'
    and t.type = 'gasto'
    and t.billing_cycle_id is null
  group by t.user_id
),
fact as (
  select user_id, coalesce(sum(billed_amount), 0) as deuda_facturada
  from public.bice_billing_cycles
  where is_paid = false
  group by user_id
)
select
  u.user_id,
  coalesce(s.saldo_debito, 0)        as saldo_debito,
  coalesce(s.saldo_inversion, 0)     as saldo_inversion,
  coalesce(nf.deuda_no_facturada, 0) as deuda_no_facturada,
  coalesce(f.deuda_facturada, 0)     as deuda_facturada,
  ( coalesce(s.saldo_debito, 0)
    - coalesce(f.deuda_facturada, 0)
    - coalesce(nf.deuda_no_facturada, 0) )                          as slrd_inmediato,
  ( coalesce(s.saldo_debito, 0)
    - coalesce(f.deuda_facturada, 0)
    - coalesce(nf.deuda_no_facturada, 0)
    + coalesce(s.saldo_inversion, 0) )                              as slrd_total,
  ( coalesce(s.saldo_debito, 0) + coalesce(s.saldo_inversion, 0) )  as saldo_contable
from usr u
left join snap    s  on s.user_id  = u.user_id
left join no_fact nf on nf.user_id = u.user_id
left join fact    f  on f.user_id  = u.user_id;
