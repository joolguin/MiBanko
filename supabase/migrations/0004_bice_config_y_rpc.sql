-- bice_config: una fila por usuaria con los días fijos de corte y vencimiento
create table if not exists public.bice_config (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  closing_day int not null check (closing_day between 1 and 28),
  due_day     int not null check (due_day between 1 and 28),
  updated_at  timestamptz not null default now()
);

alter table public.bice_config enable row level security;
drop policy if exists bice_config_owner on public.bice_config;
create policy bice_config_owner on public.bice_config
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- close_cycle: inserta el ciclo y asigna los gastos BICE sueltos, atómico.
create or replace function public.close_cycle(
  p_billed_amount numeric,
  p_cycle_start date,
  p_cycle_end date,
  p_due_date date
) returns json
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_cycle_id uuid;
  v_suma numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_billed_amount <= 0 then raise exception 'invalid_billed_amount'; end if;
  if p_cycle_start > p_cycle_end then raise exception 'invalid_cycle_range'; end if;
  if p_due_date <= p_cycle_end then raise exception 'invalid_due_date'; end if;

  insert into public.bice_billing_cycles
    (user_id, cycle_start, cycle_end, due_date, billed_amount, is_paid)
  values
    (v_uid, p_cycle_start, p_cycle_end, p_due_date, p_billed_amount, false)
  returning id into v_cycle_id;

  update public.transactions t
  set billing_cycle_id = v_cycle_id
  from public.accounts a
  where t.account_id = a.id
    and t.user_id = v_uid
    and a.type = 'credit'
    and t.type = 'gasto'
    and t.billing_cycle_id is null
    and t.transaction_date >= p_cycle_start
    and t.transaction_date <= p_cycle_end;

  select coalesce(sum(amount), 0) into v_suma
  from public.transactions
  where billing_cycle_id = v_cycle_id;

  return json_build_object(
    'cycle_id', v_cycle_id,
    'billed_amount', p_billed_amount,
    'suma_ledger', v_suma,
    'diferencia', p_billed_amount - v_suma
  );
end;
$$;

-- pay_cycle: marca pagado y crea el snapshot de Santander, atómico.
create or replace function public.pay_cycle(
  p_cycle_id uuid,
  p_santander_account_id uuid,
  p_nuevo_saldo numeric
) returns void
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_rows int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.bice_billing_cycles
  set is_paid = true
  where id = p_cycle_id and user_id = v_uid;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'cycle_not_found'; end if;

  insert into public.balance_snapshots (user_id, account_id, balance, snapshot_date)
  values (v_uid, p_santander_account_id, p_nuevo_saldo, now());
end;
$$;

grant execute on function public.close_cycle(numeric, date, date, date) to authenticated;
grant execute on function public.pay_cycle(uuid, uuid, numeric) to authenticated;
