\set ON_ERROR_STOP on
begin;

do $$
declare
  v_user uuid := '00000000-0000-0000-0000-000000000001';
  v_category uuid;
  v_product uuid;
  v_addon uuid;
  v_table uuid;
  v_table_30 uuid;
  v_table_2 uuid;
  v_session uuid;
  v_session_30 uuid;
  v_session_2 uuid;
  v_batch_1 uuid;
  v_batch_2 uuid;
  v_request_1 uuid := '10000000-0000-0000-0000-000000000001';
  v_request_2 uuid := '10000000-0000-0000-0000-000000000002';
  v_request_3 uuid := '10000000-0000-0000-0000-000000000003';
  v_receipt uuid;
  v_claimed uuid;
  v_retry_job uuid;
  v_count integer;
  v_amount numeric;
  v_status text;
begin
  if (select count(*) from public.dining_tables) <> 30 then
    raise exception 'Expected exactly 30 seeded dining tables.';
  end if;

  insert into public.categories (name, slug) values ('Teste Mesas', 'teste-mesas') returning id into v_category;
  insert into public.products (category_id, name, price, accepts_addons)
  values (v_category, 'Hambúrguer Teste', 20.00, true)
  returning id into v_product;
  insert into public.addons (name, price) values ('Bacon Teste', 3.00) returning id into v_addon;
  insert into public.product_addons (product_id, addon_id) values (v_product, v_addon);

  select id into v_table from public.dining_tables where table_number = 1;
  v_session := public.dining_open_session(v_table, v_user, 'Cliente Teste');

  begin
    perform public.dining_open_session(v_table, v_user, null);
    raise exception 'Opening the same table twice should fail.';
  exception when unique_violation then
    null;
  end;

  v_batch_1 := public.dining_add_consumption(
    v_session,
    v_request_1,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product,
      'quantity', 2,
      'notes', 'Sem cebola',
      'addons', jsonb_build_array(jsonb_build_object('addon_id', v_addon, 'quantity', 1))
    )),
    v_user,
    'Primeiro lote'
  );

  if public.dining_add_consumption(
    v_session,
    v_request_1,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 99)),
    v_user,
    'Replay que deve ser ignorado'
  ) <> v_batch_1 then
    raise exception 'Idempotent replay did not return the original batch.';
  end if;
  if (select count(*) from public.dining_session_items where dining_session_id = v_session) <> 1 then
    raise exception 'Idempotent replay duplicated consumption.';
  end if;

  select line_total into v_amount
  from public.dining_session_items
  where dining_consumption_batch_id = v_batch_1;
  if v_amount <> 46.00 then
    raise exception 'Snapshot total mismatch: %', v_amount;
  end if;

  select jsonb_array_length(payload -> 'items') into v_count
  from public.print_jobs
  where job_key = 'dining-batch:' || v_batch_1::text;
  if v_count <> 1 then
    raise exception 'First ticket should contain only its own item.';
  end if;

  v_batch_2 := public.dining_add_consumption(
    v_session,
    v_request_2,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product,
      'quantity', 1,
      'addons', jsonb_build_array(jsonb_build_object('addon_id', v_addon, 'quantity', 1))
    )),
    v_user,
    null
  );

  select (payload ->> 'batch_number')::integer, jsonb_array_length(payload -> 'items')
  into v_count, v_amount
  from public.print_jobs
  where job_key = 'dining-batch:' || v_batch_2::text;
  if v_count <> 2 or v_amount <> 1 then
    raise exception 'Incremental second ticket is invalid.';
  end if;

  select id into v_table_30 from public.dining_tables where table_number = 30;
  v_session_30 := public.dining_open_session(v_table_30, v_user, null);
  begin
    perform public.dining_set_active_count(29);
    raise exception 'Reducing over occupied table 30 should fail.';
  exception when raise_exception then
    if sqlerrm not like 'Feche a mesa ocupada%' then raise; end if;
  end;
  if (select count(*) from public.dining_tables where is_active) <> 30 then
    raise exception 'Blocked reduction changed table activation.';
  end if;

  perform public.dining_cancel_empty_session(v_session_30, v_user);
  perform public.dining_set_active_count(29);
  if (select is_active from public.dining_tables where table_number = 30) then
    raise exception 'Free table 30 was not deactivated.';
  end if;
  perform public.dining_set_active_count(30);

  v_receipt := public.dining_close_session(
    v_session, v_user, 10, 'misto', 'pix', 30, null, 'Fechamento teste'
  );
  select total into v_amount from public.dining_sessions where id = v_session;
  if v_amount <> 75.90 then
    raise exception 'Service charge total mismatch: %', v_amount;
  end if;
  if (select auto_print from public.print_jobs where id = v_receipt) then
    raise exception 'Dining receipt must remain manual.';
  end if;
  if (select payload ->> 'secondary_payment_method' from public.print_jobs where id = v_receipt) <> 'pix' then
    raise exception 'Mixed payment composition missing from receipt.';
  end if;

  select id into v_table_2 from public.dining_tables where table_number = 2;
  v_session_2 := public.dining_open_session(v_table_2, v_user, null);
  perform public.dining_add_consumption(
    v_session_2, v_request_3,
    jsonb_build_array(jsonb_build_object('product_id', v_product, 'quantity', 1)),
    v_user, null
  );
  begin
    perform public.dining_close_session(v_session_2, v_user, 0, null);
    raise exception 'Null payment method should fail.';
  exception when raise_exception then
    if sqlerrm <> 'Forma de pagamento inválida.' then raise; end if;
  end;
  begin
    perform public.dining_close_session(v_session_2, v_user, 0, 'dinheiro', null, null, 1);
    raise exception 'Insufficient cash tender should fail.';
  exception when raise_exception then
    if sqlerrm <> 'O valor entregue em dinheiro não pode ser menor que o total.' then raise; end if;
  end;

  select id into v_claimed
  from public.print_claim_next_job('station-a')
  limit 1;
  if v_claimed is null then
    raise exception 'Atomic queue claim returned no automatic job.';
  end if;
  v_retry_job := v_claimed;
  if exists (select 1 from public.print_claim_job(v_claimed, 'station-b')) then
    raise exception 'A second station claimed the same job.';
  end if;

  perform public.print_fail_job(v_claimed, 'station-a', 'Falha simulada');
  select status into v_status from public.print_jobs where id = v_claimed;
  if v_status <> 'pending' then
    raise exception 'First print failure should return to pending.';
  end if;

  select id into v_claimed from public.print_claim_job(v_retry_job, 'station-a') limit 1;
  if v_claimed is null then
    raise exception 'Specific retry claim returned no job.';
  end if;
  perform public.print_fail_job(v_retry_job, 'station-a', 'Segunda falha simulada');
  select id into v_claimed from public.print_claim_job(v_retry_job, 'station-a') limit 1;
  if v_claimed is null then
    raise exception 'Third claim returned no job.';
  end if;
  perform public.print_renew_job_claim(v_retry_job, 'station-a');
  if (select lease_expires_at < now() + interval '9 minutes' from public.print_jobs where id = v_retry_job) then
    raise exception 'Claim heartbeat did not renew the lease.';
  end if;
  update public.print_jobs
  set claimed_at = now() - interval '11 minutes',
      lease_expires_at = now() - interval '1 minute'
  where id = v_retry_job;
  perform 1 from public.print_claim_next_job('station-b');
  select status into v_status from public.print_jobs where id = v_retry_job;
  if v_status <> 'failed' then
    raise exception 'Interrupted third attempt should become retryable failed state.';
  end if;

  raise notice 'DINING_PRINT_INTEGRATION_OK';
end;
$$;

rollback;
