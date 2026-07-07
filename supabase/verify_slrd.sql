-- MiBanko — Verificación del cálculo del SLRD sobre el seed conocido.
-- Corre después de aplicar migraciones + seed. Cada assert debe dar 't' (true).

with s as (
  select * from public.v_slrd
  where user_id = (select id from auth.users where email = 'josefa.olguin@gmail.com')
)
select
  saldo_debito, saldo_inversion, deuda_no_facturada, deuda_facturada,
  slrd_inmediato, slrd_total, saldo_contable,
  (saldo_debito       = 500000)  as ok_saldo_debito,
  (saldo_inversion    = 2000000) as ok_saldo_inversion,
  (deuda_no_facturada = 85000)   as ok_deuda_no_facturada,
  (deuda_facturada    = 300000)  as ok_deuda_facturada,
  (slrd_inmediato     = 115000)  as ok_slrd_inmediato,
  (slrd_total         = 2115000) as ok_slrd_total,
  (saldo_contable     = 2500000) as ok_saldo_contable
from s;
