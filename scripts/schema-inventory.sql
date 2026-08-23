-- Execute antes e depois da migração e compare os resultados byte a byte.
-- O filtro exclui exclusivamente os objetos novos deste módulo.
with existing_tables as (
  select c.oid, n.nspname as schema_name, c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relname not like 'dining\_%' escape '\'
    and c.relname not like 'print\_%' escape '\'
)
select jsonb_pretty(jsonb_build_object(
  'columns', (
    select jsonb_agg(to_jsonb(x) order by x.schema_name, x.table_name, x.ordinal_position)
    from (
      select table_schema as schema_name, table_name, ordinal_position, column_name,
             data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and table_name not like 'dining\_%' escape '\'
        and table_name not like 'print\_%' escape '\'
    ) x
  ),
  'constraints', (
    select jsonb_agg(to_jsonb(x) order by x.schema_name, x.table_name, x.constraint_name)
    from (
      select n.nspname as schema_name, c.relname as table_name,
             con.conname as constraint_name, pg_get_constraintdef(con.oid, true) as definition
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where c.oid in (select oid from existing_tables)
    ) x
  ),
  'indexes', (
    select jsonb_agg(to_jsonb(x) order by x.schemaname, x.tablename, x.indexname)
    from (
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename not like 'dining\_%' escape '\'
        and tablename not like 'print\_%' escape '\'
    ) x
  ),
  'triggers', (
    select jsonb_agg(to_jsonb(x) order by x.schema_name, x.table_name, x.trigger_name)
    from (
      select n.nspname as schema_name, c.relname as table_name,
             t.tgname as trigger_name, t.tgisinternal as is_internal,
             pg_get_triggerdef(t.oid, true) as definition
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where c.oid in (select oid from existing_tables)
    ) x
  ),
  'policies', (
    select jsonb_agg(to_jsonb(x) order by x.schemaname, x.tablename, x.policyname)
    from (
      select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
      where schemaname = 'public'
        and tablename not like 'dining\_%' escape '\'
        and tablename not like 'print\_%' escape '\'
    ) x
  ),
  'functions', (
    select jsonb_agg(to_jsonb(x) order by x.schema_name, x.function_name, x.arguments)
    from (
      select n.nspname as schema_name, p.proname as function_name,
             pg_get_function_identity_arguments(p.oid) as arguments,
             pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname not like 'dining\_%' escape '\'
        and p.proname not like 'print\_%' escape '\'
      ) x
  ),
  'types', (
    select jsonb_agg(to_jsonb(x) order by x.schema_name, x.type_name)
    from (
      select n.nspname as schema_name, t.typname as type_name, t.typtype,
             t.typcategory, pg_get_userbyid(t.typowner) as owner
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname not like 'dining\_%' escape '\'
        and t.typname not like 'print\_%' escape '\'
        and t.typname not like '\_dining\_%' escape '\'
        and t.typname not like '\_print\_%' escape '\'
    ) x
  ),
  'table_security', (
    select jsonb_agg(to_jsonb(x) order by x.schema_name, x.table_name)
    from (
      select n.nspname as schema_name, c.relname as table_name,
             c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.oid in (select oid from existing_tables)
    ) x
  ),
  'table_privileges', (
    select jsonb_agg(to_jsonb(x) order by x.table_schema, x.table_name, x.grantee, x.privilege_type)
    from (
      select table_schema, table_name, grantor, grantee, privilege_type, is_grantable
      from information_schema.table_privileges
      where table_schema = 'public'
        and table_name not like 'dining\_%' escape '\'
        and table_name not like 'print\_%' escape '\'
    ) x
  ),
  'routine_privileges', (
    select jsonb_agg(to_jsonb(x) order by x.routine_schema, x.routine_name, x.grantee, x.privilege_type)
    from (
      select routine_schema, routine_name, grantor, grantee, privilege_type, is_grantable
      from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name not like 'dining\_%' escape '\'
        and routine_name not like 'print\_%' escape '\'
    ) x
  )
)) as schema_inventory;
