-- Isolated dine-in and thermal printing domain.
-- Safety invariant: this migration creates and writes only dining_* / print_* objects.

begin;

create table public.dining_tables (
  id uuid primary key default gen_random_uuid(),
  table_number smallint not null unique check (table_number between 1 and 30),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.dining_sessions (
  id uuid primary key default gen_random_uuid(),
  dining_table_id uuid not null references public.dining_tables(id),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  customer_name text,
  notes text,
  opened_at timestamptz not null default now(),
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  service_charge_percent numeric(5,2) not null default 0 check (service_charge_percent between 0 and 30),
  service_charge_amount numeric(12,2) not null default 0 check (service_charge_amount >= 0),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text check (
    payment_method is null or payment_method in (
      'pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'misto', 'nao_informado'
    )
  ),
  secondary_payment_method text check (
    secondary_payment_method is null or secondary_payment_method in (
      'pix', 'cartao_credito', 'cartao_debito', 'dinheiro'
    )
  ),
  cash_amount numeric(12,2) check (cash_amount is null or cash_amount >= 0),
  change_for numeric(12,2) check (change_for is null or change_for >= 0),
  updated_at timestamptz not null default now(),
  check (
    (status = 'open' and closed_at is null)
    or (status in ('closed', 'cancelled') and closed_at is not null)
  )
);

create unique index dining_sessions_one_open_per_table_idx
  on public.dining_sessions (dining_table_id)
  where status = 'open';
create index dining_sessions_status_opened_idx
  on public.dining_sessions (status, opened_at desc);

create table public.dining_consumption_batches (
  id uuid primary key default gen_random_uuid(),
  dining_session_id uuid not null references public.dining_sessions(id),
  request_key uuid not null,
  batch_number integer not null check (batch_number > 0),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (dining_session_id, batch_number),
  unique (dining_session_id, request_key)
);

create index dining_consumption_batches_session_idx
  on public.dining_consumption_batches (dining_session_id, batch_number);

create table public.dining_session_items (
  id uuid primary key default gen_random_uuid(),
  dining_session_id uuid not null references public.dining_sessions(id),
  dining_consumption_batch_id uuid not null references public.dining_consumption_batches(id),
  -- Catalog ID is informational only: no FK may install triggers on legacy tables.
  product_id uuid,
  product_name_snapshot text not null,
  unit_price_snapshot numeric(12,2) not null check (unit_price_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index dining_session_items_session_idx
  on public.dining_session_items (dining_session_id, created_at);
create index dining_session_items_batch_idx
  on public.dining_session_items (dining_consumption_batch_id);

create table public.dining_session_item_addons (
  id uuid primary key default gen_random_uuid(),
  dining_session_item_id uuid not null references public.dining_session_items(id) on delete cascade,
  -- Catalog ID is informational only: the immutable snapshot remains authoritative.
  addon_id uuid,
  addon_name_snapshot text not null,
  unit_price_snapshot numeric(12,2) not null check (unit_price_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index dining_session_item_addons_item_idx
  on public.dining_session_item_addons (dining_session_item_id);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique,
  source_kind text not null check (source_kind in ('online_order', 'dining_batch', 'dining_receipt')),
  source_id uuid not null,
  document_type text not null check (document_type in ('kitchen_ticket', 'customer_receipt')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  auto_print boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'printing', 'printed', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 3),
  station_id text,
  last_error text,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  printed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'printed' or printed_at is not null)
);

create index print_jobs_queue_idx
  on public.print_jobs (auto_print, status, created_at);
create index print_jobs_source_idx
  on public.print_jobs (source_kind, source_id);

create table public.print_system_state (
  singleton boolean primary key default true check (singleton),
  activated_at timestamptz not null default now(),
  last_online_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.dining_tables (table_number)
select n from generate_series(1, 30) as n;

insert into public.print_system_state (singleton) values (true);

alter table public.dining_tables enable row level security;
alter table public.dining_sessions enable row level security;
alter table public.dining_consumption_batches enable row level security;
alter table public.dining_session_items enable row level security;
alter table public.dining_session_item_addons enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_system_state enable row level security;

revoke all on public.dining_tables from public, anon, authenticated;
revoke all on public.dining_sessions from public, anon, authenticated;
revoke all on public.dining_consumption_batches from public, anon, authenticated;
revoke all on public.dining_session_items from public, anon, authenticated;
revoke all on public.dining_session_item_addons from public, anon, authenticated;
revoke all on public.print_jobs from public, anon, authenticated;
revoke all on public.print_system_state from public, anon, authenticated;

grant all on public.dining_tables to service_role;
grant all on public.dining_sessions to service_role;
grant all on public.dining_consumption_batches to service_role;
grant all on public.dining_session_items to service_role;
grant all on public.dining_session_item_addons to service_role;
grant all on public.print_jobs to service_role;
grant all on public.print_system_state to service_role;

create function public.dining_open_session(
  p_table_id uuid,
  p_opened_by uuid,
  p_customer_name text default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
begin
  perform 1
  from public.dining_tables
  where id = p_table_id and is_active
  for update;

  if not found then
    raise exception 'Mesa inexistente ou inativa.';
  end if;

  insert into public.dining_sessions (dining_table_id, opened_by, customer_name)
  values (p_table_id, p_opened_by, nullif(btrim(p_customer_name), ''))
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create function public.dining_set_active_count(p_active_count integer)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_active_count not between 1 and 30 then
    raise exception 'A quantidade de mesas deve ficar entre 1 e 30.';
  end if;

  perform 1 from public.dining_tables order by table_number for update;

  if abs(p_active_count - (select count(*) from public.dining_tables where is_active)) > 1 then
    raise exception 'Ajuste somente uma mesa por vez.';
  end if;

  if exists (
    select 1
    from public.dining_tables t
    join public.dining_sessions s
      on s.dining_table_id = t.id and s.status = 'open'
    where t.table_number > p_active_count
  ) then
    raise exception 'Feche a mesa ocupada de maior número antes de reduzir.';
  end if;

  update public.dining_tables
  set is_active = table_number <= p_active_count
  where is_active is distinct from (table_number <= p_active_count);
end;
$$;

create function public.dining_add_consumption(
  p_session_id uuid,
  p_request_key uuid,
  p_items jsonb,
  p_created_by uuid,
  p_notes text default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_batch_number integer;
  v_table_number integer;
  v_item jsonb;
  v_addon jsonb;
  v_product record;
  v_addon_row record;
  v_item_id uuid;
  v_quantity integer;
  v_addon_quantity integer;
  v_addons_total numeric(12,2);
  v_line_total numeric(12,2);
  v_payload jsonb;
begin
  if p_request_key is null then
    raise exception 'A chave idempotente do lote é obrigatória.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O lote precisa ter pelo menos um item.';
  end if;

  select t.table_number
  into v_table_number
  from public.dining_sessions s
  join public.dining_tables t on t.id = s.dining_table_id
  where s.id = p_session_id and s.status = 'open'
  for update of s;

  if not found then
    raise exception 'Comanda não encontrada ou já fechada.';
  end if;

  select id into v_batch_id
  from public.dining_consumption_batches
  where dining_session_id = p_session_id and request_key = p_request_key;

  if v_batch_id is not null then
    return v_batch_id;
  end if;

  select coalesce(max(batch_number), 0) + 1
  into v_batch_number
  from public.dining_consumption_batches
  where dining_session_id = p_session_id;

  insert into public.dining_consumption_batches (
    dining_session_id, request_key, batch_number, notes, created_by
  ) values (
    p_session_id, p_request_key, v_batch_number, nullif(btrim(p_notes), ''), p_created_by
  ) returning id into v_batch_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := greatest(1, coalesce((v_item ->> 'quantity')::integer, 1));

    select p.id, p.name, p.price, p.accepts_addons
    into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid and p.is_active;

    if not found then
      raise exception 'Produto inválido ou inativo: %', v_item ->> 'product_id';
    end if;

    v_addons_total := 0;
    if jsonb_typeof(v_item -> 'addons') = 'array' then
      for v_addon in select value from jsonb_array_elements(v_item -> 'addons')
      loop
        if not v_product.accepts_addons then
          raise exception 'O produto % não aceita adicionais.', v_product.name;
        end if;

        select a.id, a.name, a.price
        into v_addon_row
        from public.addons a
        join public.product_addons pa
          on pa.addon_id = a.id and pa.product_id = v_product.id
        where a.id = (v_addon ->> 'addon_id')::uuid and a.is_active;

        if not found then
          raise exception 'Adicional inválido para o produto %.', v_product.name;
        end if;

        v_addon_quantity := greatest(1, coalesce((v_addon ->> 'quantity')::integer, 1));
        v_addons_total := v_addons_total + (v_addon_row.price * v_addon_quantity);
      end loop;
    end if;

    v_line_total := round((v_product.price + v_addons_total) * v_quantity, 2);

    insert into public.dining_session_items (
      dining_session_id,
      dining_consumption_batch_id,
      product_id,
      product_name_snapshot,
      unit_price_snapshot,
      quantity,
      line_total,
      notes
    ) values (
      p_session_id,
      v_batch_id,
      v_product.id,
      v_product.name,
      v_product.price,
      v_quantity,
      v_line_total,
      nullif(btrim(v_item ->> 'notes'), '')
    ) returning id into v_item_id;

    if jsonb_typeof(v_item -> 'addons') = 'array' then
      for v_addon in select value from jsonb_array_elements(v_item -> 'addons')
      loop
        select a.id, a.name, a.price
        into v_addon_row
        from public.addons a
        where a.id = (v_addon ->> 'addon_id')::uuid;
        v_addon_quantity := greatest(1, coalesce((v_addon ->> 'quantity')::integer, 1));

        insert into public.dining_session_item_addons (
          dining_session_item_id,
          addon_id,
          addon_name_snapshot,
          unit_price_snapshot,
          quantity
        ) values (
          v_item_id,
          v_addon_row.id,
          v_addon_row.name,
          v_addon_row.price,
          v_addon_quantity
        );
      end loop;
    end if;
  end loop;

  select jsonb_build_object(
    'source', 'dining_batch',
    'batch_id', v_batch_id,
    'session_id', p_session_id,
    'table_number', v_table_number,
    'batch_number', v_batch_number,
    'created_at', b.created_at,
    'notes', b.notes,
    'items', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'name', i.product_name_snapshot,
        'quantity', i.quantity,
        'notes', i.notes,
        'addons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', a.addon_name_snapshot,
            'quantity', a.quantity
          ) order by a.created_at)
          from public.dining_session_item_addons a
          where a.dining_session_item_id = i.id
        ), '[]'::jsonb)
      ) order by i.created_at
    ), '[]'::jsonb)
  )
  into v_payload
  from public.dining_consumption_batches b
  join public.dining_session_items i on i.dining_consumption_batch_id = b.id
  where b.id = v_batch_id
  group by b.id, b.created_at, b.notes;

  insert into public.print_jobs (
    job_key, source_kind, source_id, document_type, payload, auto_print
  ) values (
    'dining-batch:' || v_batch_id::text,
    'dining_batch',
    v_batch_id,
    'kitchen_ticket',
    v_payload,
    true
  );

  update public.dining_sessions
  set updated_at = now()
  where id = p_session_id;

  return v_batch_id;
end;
$$;

create function public.dining_cancel_empty_session(
  p_session_id uuid,
  p_cancelled_by uuid
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.dining_sessions s
  set status = 'cancelled',
      closed_at = now(),
      closed_by = p_cancelled_by,
      updated_at = now()
  where s.id = p_session_id
    and s.status = 'open'
    and not exists (
      select 1 from public.dining_session_items i where i.dining_session_id = s.id
    );

  if not found then
    raise exception 'Somente uma comanda aberta e sem consumo pode ser liberada.';
  end if;
end;
$$;

create function public.dining_close_session(
  p_session_id uuid,
  p_closed_by uuid,
  p_service_charge_percent numeric,
  p_payment_method text,
  p_secondary_payment_method text default null,
  p_cash_amount numeric default null,
  p_change_for numeric default null,
  p_notes text default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_receipt_job_id uuid;
  v_table_number integer;
  v_opened_at timestamptz;
  v_closed_at timestamptz := now();
  v_subtotal numeric(12,2);
  v_service numeric(12,2);
  v_total numeric(12,2);
  v_payload jsonb;
begin
  if p_service_charge_percent < 0 or p_service_charge_percent > 30 then
    raise exception 'A taxa de serviço deve ficar entre 0 e 30%%.';
  end if;

  if p_payment_method is null or p_payment_method not in (
    'pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'misto', 'nao_informado'
  ) then
    raise exception 'Forma de pagamento inválida.';
  end if;

  select t.table_number, s.opened_at
  into v_table_number, v_opened_at
  from public.dining_sessions s
  join public.dining_tables t on t.id = s.dining_table_id
  where s.id = p_session_id and s.status = 'open'
  for update of s;

  if not found then
    raise exception 'Comanda não encontrada ou já fechada.';
  end if;

  select coalesce(sum(line_total), 0)
  into v_subtotal
  from public.dining_session_items
  where dining_session_id = p_session_id;

  if v_subtotal = 0 then
    raise exception 'Use a liberação de mesa para uma comanda sem consumo.';
  end if;

  v_service := round(v_subtotal * p_service_charge_percent / 100, 2);
  v_total := v_subtotal + v_service;

  if p_payment_method = 'misto' and (
    p_secondary_payment_method is null
    or p_secondary_payment_method not in ('pix', 'cartao_credito', 'cartao_debito')
    or p_cash_amount is null
    or p_cash_amount <= 0
    or p_cash_amount >= v_total
  ) then
    raise exception 'Informe o valor em dinheiro e a segunda forma do pagamento misto.';
  end if;

  if p_payment_method <> 'misto' and (
    p_secondary_payment_method is not null or p_cash_amount is not null
  ) then
    raise exception 'Composição secundária é permitida somente no pagamento misto.';
  end if;

  if p_change_for is not null and p_payment_method <> 'dinheiro' then
    raise exception 'Troco para é permitido somente no pagamento em dinheiro.';
  end if;

  if p_payment_method = 'dinheiro' and p_change_for is not null and p_change_for < v_total then
    raise exception 'O valor entregue em dinheiro não pode ser menor que o total.';
  end if;

  update public.dining_sessions
  set status = 'closed',
      closed_at = v_closed_at,
      closed_by = p_closed_by,
      service_charge_percent = p_service_charge_percent,
      service_charge_amount = v_service,
      subtotal = v_subtotal,
      total = v_total,
      payment_method = p_payment_method,
      secondary_payment_method = nullif(p_secondary_payment_method, ''),
      cash_amount = p_cash_amount,
      change_for = p_change_for,
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      updated_at = v_closed_at
  where id = p_session_id;

  select jsonb_build_object(
    'source', 'dining_receipt',
    'session_id', p_session_id,
    'table_number', v_table_number,
    'opened_at', v_opened_at,
    'closed_at', v_closed_at,
    'subtotal', v_subtotal,
    'service_charge_percent', p_service_charge_percent,
    'service_charge_amount', v_service,
    'total', v_total,
    'payment_method', p_payment_method,
    'secondary_payment_method', p_secondary_payment_method,
    'cash_amount', p_cash_amount,
    'change_for', p_change_for,
    'notes', p_notes,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.product_name_snapshot,
        'quantity', i.quantity,
        'unit_price', i.unit_price_snapshot,
        'line_total', i.line_total,
        'notes', i.notes,
        'addons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', a.addon_name_snapshot,
            'quantity', a.quantity,
            'unit_price', a.unit_price_snapshot
          ) order by a.created_at)
          from public.dining_session_item_addons a
          where a.dining_session_item_id = i.id
        ), '[]'::jsonb)
      ) order by i.created_at)
      from public.dining_session_items i
      where i.dining_session_id = p_session_id
    ), '[]'::jsonb),
    'non_fiscal_notice', 'DOCUMENTO NÃO FISCAL'
  ) into v_payload;

  insert into public.print_jobs (
    job_key, source_kind, source_id, document_type, payload, auto_print
  ) values (
    'dining-receipt:' || p_session_id::text,
    'dining_receipt',
    p_session_id,
    'customer_receipt',
    v_payload,
    false
  ) returning id into v_receipt_job_id;

  return v_receipt_job_id;
end;
$$;

create function public.print_claim_next_job(p_station_id text)
returns setof public.print_jobs
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
begin
  update public.print_jobs
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      station_id = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = now(),
      last_error = coalesce(last_error, 'Trabalho recuperado após interrupção da estação.')
  where status = 'printing'
    and coalesce(lease_expires_at, claimed_at + interval '10 minutes') < now();

  select id into v_job_id
  from public.print_jobs
  where auto_print
    and status = 'pending'
    and attempts < 3
  order by created_at
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.print_jobs
  set status = 'printing',
      attempts = attempts + 1,
      station_id = p_station_id,
      claimed_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

create function public.print_complete_job(p_job_id uuid, p_station_id text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.print_jobs
  set status = 'printed', printed_at = now(), updated_at = now(), last_error = null,
      station_id = null, claimed_at = null, lease_expires_at = null
  where id = p_job_id and status = 'printing' and station_id = p_station_id;

  if not found then
    raise exception 'Trabalho não pertence a esta estação.';
  end if;
end;
$$;

create function public.print_renew_job_claim(
  p_job_id uuid,
  p_station_id text,
  p_hold_seconds integer default 600
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_hold_seconds < 30 or p_hold_seconds > 7200 then
    raise exception 'Duração de lease inválida.';
  end if;

  update public.print_jobs
  set claimed_at = now(),
      lease_expires_at = now() + make_interval(secs => p_hold_seconds),
      updated_at = now()
  where id = p_job_id and status = 'printing' and station_id = p_station_id;

  if not found then
    raise exception 'Trabalho não pertence a esta estação.';
  end if;
end;
$$;

create function public.print_claim_job(p_job_id uuid, p_station_id text)
returns setof public.print_jobs
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  update public.print_jobs
  set status = 'printing',
      attempts = attempts + 1,
      station_id = p_station_id,
      claimed_at = now(),
      lease_expires_at = now() + interval '10 minutes',
      updated_at = now()
  where id = p_job_id
    and status = 'pending'
    and attempts < 3
  returning *;
end;
$$;

create function public.print_fail_job(p_job_id uuid, p_station_id text, p_error text)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.print_jobs
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      last_error = left(coalesce(p_error, 'Falha de impressão.'), 1000),
      station_id = null,
      claimed_at = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_job_id and status = 'printing' and station_id = p_station_id;

  if not found then
    raise exception 'Trabalho não pertence a esta estação.';
  end if;
end;
$$;

create function public.print_retry_job(p_job_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.print_jobs
  set status = 'pending', attempts = 0, station_id = null, claimed_at = null,
      lease_expires_at = null, last_error = null, updated_at = now()
  where id = p_job_id and status = 'failed';

  if not found then
    raise exception 'Somente trabalhos com falha podem ser reenviados.';
  end if;
end;
$$;

revoke all on function public.dining_open_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.dining_set_active_count(integer) from public, anon, authenticated;
revoke all on function public.dining_add_consumption(uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.dining_cancel_empty_session(uuid, uuid) from public, anon, authenticated;
revoke all on function public.dining_close_session(uuid, uuid, numeric, text, text, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.print_claim_next_job(text) from public, anon, authenticated;
revoke all on function public.print_complete_job(uuid, text) from public, anon, authenticated;
revoke all on function public.print_renew_job_claim(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.print_claim_job(uuid, text) from public, anon, authenticated;
revoke all on function public.print_fail_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.print_retry_job(uuid) from public, anon, authenticated;

grant execute on function public.dining_open_session(uuid, uuid, text) to service_role;
grant execute on function public.dining_set_active_count(integer) to service_role;
grant execute on function public.dining_add_consumption(uuid, uuid, jsonb, uuid, text) to service_role;
grant execute on function public.dining_cancel_empty_session(uuid, uuid) to service_role;
grant execute on function public.dining_close_session(uuid, uuid, numeric, text, text, numeric, numeric, text) to service_role;
grant execute on function public.print_claim_next_job(text) to service_role;
grant execute on function public.print_complete_job(uuid, text) to service_role;
grant execute on function public.print_renew_job_claim(uuid, text, integer) to service_role;
grant execute on function public.print_claim_job(uuid, text) to service_role;
grant execute on function public.print_fail_job(uuid, text, text) to service_role;
grant execute on function public.print_retry_job(uuid) to service_role;

commit;
