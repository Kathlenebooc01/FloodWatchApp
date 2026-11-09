-- The utilities primary key is id; utilities_id belongs to resource_request_items.
-- Repair only public logistics functions containing the incorrect join reference.
do $$
declare
  function_record record;
  function_sql text;
  repaired_count integer := 0;
begin
  for function_record in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%u.utilities_id%'
      and pg_get_functiondef(p.oid) like '%resource_request_items%'
  loop
    function_sql := replace(pg_get_functiondef(function_record.oid), 'u.utilities_id', 'u.id');
    execute function_sql;
    repaired_count := repaired_count + 1;
    raise notice 'Repaired logistics function %', function_record.proname;
  end loop;

  if repaired_count = 0 then
    raise exception 'No public logistics function containing u.utilities_id was found; inspect policies and views before applying another fix.';
  end if;
end;
$$;
