-- El default current_date se evalúa en UTC (la DB corre en UTC), así que una
-- inserción de noche en Santiago quedaba fechada al día siguiente. Se ancla el
-- default a la fecha de calendario en America/Santiago.
-- Red de seguridad: los caminos de inserción actuales ya mandan transaction_date
-- explícito (registro en cliente, import desde CSV, run_due_subscriptions);
-- esto cubre inserciones futuras que omitan la columna.
alter table public.transactions
  alter column transaction_date
  set default (now() at time zone 'America/Santiago')::date;
