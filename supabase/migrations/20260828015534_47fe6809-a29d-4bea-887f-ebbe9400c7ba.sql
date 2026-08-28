ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.dining_sessions ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.dining_sessions ADD COLUMN IF NOT EXISTS customer_address text;

CREATE OR REPLACE FUNCTION public.dining_open_session(p_table_id uuid, p_opened_by uuid, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_session_id uuid;
  v_phone_norm text;
begin
  perform 1
  from public.dining_tables
  where id = p_table_id and is_active
  for update;

  if not found then
    raise exception 'Mesa inexistente ou inativa.';
  end if;

  v_phone_norm := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');

  insert into public.dining_sessions (dining_table_id, opened_by, customer_name, customer_phone, customer_address)
  values (
    p_table_id,
    p_opened_by,
    nullif(btrim(p_customer_name), ''),
    nullif(v_phone_norm, ''),
    nullif(btrim(p_customer_address), '')
  )
  returning id into v_session_id;

  if length(v_phone_norm) >= 8 then
    insert into public.customers (phone, name, last_address)
    values (
      v_phone_norm,
      nullif(btrim(coalesce(p_customer_name, '')), ''),
      nullif(btrim(coalesce(p_customer_address, '')), '')
    )
    on conflict (phone) do update set
      name = coalesce(nullif(btrim(coalesce(excluded.name, '')), ''), public.customers.name),
      last_address = coalesce(excluded.last_address, public.customers.last_address),
      updated_at = now();
  end if;

  return v_session_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.print_retry_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.print_jobs
  set status = 'pending', attempts = 0, station_id = null, claimed_at = null,
      lease_expires_at = null, last_error = null, printed_at = null, updated_at = now()
  where id = p_job_id and status in ('failed', 'printed');

  if not found then
    -- libera também trabalhos travados em "imprimindo" com lease vencido
    update public.print_jobs
    set status = 'pending', attempts = 0, station_id = null, claimed_at = null,
        lease_expires_at = null, last_error = null, updated_at = now()
    where id = p_job_id
      and status = 'printing'
      and coalesce(lease_expires_at, claimed_at + interval '10 minutes') < now();

    if not found then
      raise exception 'Este trabalho de impressão não pode ser reenviado agora.';
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.print_reopen_job(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.print_jobs
  set status = 'pending',
      attempts = 0,
      station_id = null,
      claimed_at = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now()
  where id = p_job_id
    and (
      status in ('failed', 'printed', 'pending')
      or (status = 'printing' and coalesce(lease_expires_at, claimed_at + interval '10 minutes') < now())
    );

  if not found then
    raise exception 'Esta comanda está sendo impressa por outra estação neste momento.';
  end if;
end;
$function$;