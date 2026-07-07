-- MiBanko — Datos de prueba (Fase 0)
-- Resuelve la usuaria única por email y siembra un escenario conocido para verificar el SLRD.
-- Idempotente: borra los datos previos de la usuaria y los recrea.
--
-- Escenario esperado:
--   saldo_debito       = 500.000   (Santander)
--   saldo_inversion    = 2.000.000 (Fintual)
--   deuda_no_facturada =    85.000 (3 gastos BICE sin ciclo: 25k + 15k + 45k)
--   deuda_facturada    =   300.000 (1 ciclo cerrado no pagado)
--   slrd_inmediato     =   115.000 (500k − 300k − 85k)
--   slrd_total         = 2.115.000 (115k + 2.000k)
--   saldo_contable     = 2.500.000 (500k + 2.000k)
-- Ruido que NO debe afectar el SLRD: 1 gasto en Santander (débito) y 1 ciclo ya pagado.

do $$
declare
  uid        uuid;
  acc_santander uuid;
  acc_bice      uuid;
  acc_fintual   uuid;
  cat_comida     uuid;
  cat_transporte uuid;
  cat_hobbies    uuid;
  cycle_open uuid;
  cycle_paid uuid;
begin
  select id into uid from auth.users where email = 'josefa.olguin@gmail.com' limit 1;
  if uid is null then
    raise exception 'No existe la usuaria josefa.olguin@gmail.com; crearla antes de seedear.';
  end if;

  -- limpiar datos previos (orden seguro por FKs)
  delete from public.transactions        where user_id = uid;
  delete from public.balance_snapshots    where user_id = uid;
  delete from public.fixed_subscriptions  where user_id = uid;
  delete from public.bice_billing_cycles  where user_id = uid;
  delete from public.categories           where user_id = uid;
  delete from public.accounts             where user_id = uid;

  -- cuentas
  insert into public.accounts (user_id, name, type, bank)
    values (uid, 'Santander Vista', 'debit', 'Santander') returning id into acc_santander;
  insert into public.accounts (user_id, name, type, bank)
    values (uid, 'BICE Visa Gold', 'credit', 'BICE') returning id into acc_bice;
  insert into public.accounts (user_id, name, type, bank)
    values (uid, 'Fintual', 'investment', 'Fintual') returning id into acc_fintual;

  -- categorías base
  insert into public.categories (user_id, name) values (uid, 'Comida')       returning id into cat_comida;
  insert into public.categories (user_id, name) values (uid, 'Transporte')   returning id into cat_transporte;
  insert into public.categories (user_id, name) values (uid, 'Hobbies')      returning id into cat_hobbies;
  insert into public.categories (user_id, name) values (uid, 'Suscripciones');
  insert into public.categories (user_id, name) values (uid, 'Servicios');
  insert into public.categories (user_id, name) values (uid, 'Ingreso');

  -- snapshots (último por cuenta)
  insert into public.balance_snapshots (user_id, account_id, balance, snapshot_date)
    values (uid, acc_santander, 500000, now());
  insert into public.balance_snapshots (user_id, account_id, balance, snapshot_date)
    values (uid, acc_fintual, 2000000, now());
  -- snapshot viejo de Santander que NO debe usarse (comprueba "último snapshot")
  insert into public.balance_snapshots (user_id, account_id, balance, snapshot_date)
    values (uid, acc_santander, 999999, now() - interval '10 days');

  -- ciclos BICE
  insert into public.bice_billing_cycles (user_id, cycle_start, cycle_end, due_date, billed_amount, is_paid)
    values (uid, date '2026-06-01', date '2026-06-30', date '2026-07-15', 300000, false)
    returning id into cycle_open;
  insert into public.bice_billing_cycles (user_id, cycle_start, cycle_end, due_date, billed_amount, is_paid)
    values (uid, date '2026-05-01', date '2026-05-31', date '2026-06-15', 250000, true)
    returning id into cycle_paid;

  -- gastos BICE del ciclo actual, sin facturar (cuentan como deuda_no_facturada)
  insert into public.transactions (user_id, account_id, type, amount, transaction_date, channel, category_id, description)
    values (uid, acc_bice, 'gasto', 25000, current_date, 'tarjeta_fisica', cat_comida, 'Almuerzo');
  insert into public.transactions (user_id, account_id, type, amount, transaction_date, channel, category_id, description)
    values (uid, acc_bice, 'gasto', 15000, current_date, 'onepay', cat_transporte, 'Uber');
  insert into public.transactions (user_id, account_id, type, amount, transaction_date, channel, category_id, description)
    values (uid, acc_bice, 'gasto', 45000, current_date, 'wallet_pixel', cat_hobbies, 'Vinilo');

  -- gasto ya facturado (asignado a un ciclo): NO cuenta como deuda_no_facturada
  insert into public.transactions (user_id, account_id, type, amount, transaction_date, channel, category_id, description, billing_cycle_id)
    values (uid, acc_bice, 'gasto', 120000, date '2026-06-10', 'tarjeta_fisica', cat_comida, 'Compra facturada', cycle_open);

  -- gasto en débito (Santander): solo analítica, NO afecta el SLRD
  insert into public.transactions (user_id, account_id, type, amount, transaction_date, channel, category_id, description)
    values (uid, acc_santander, 'gasto', 10000, current_date, 'transferencia_app', cat_comida, 'Feria');
end $$;
