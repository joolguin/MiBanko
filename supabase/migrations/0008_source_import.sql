-- Permite marcar transacciones importadas desde cartola (source='import'),
-- distinguiéndolas de las manuales y las del cron de suscripciones.
alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'auto', 'import'));
