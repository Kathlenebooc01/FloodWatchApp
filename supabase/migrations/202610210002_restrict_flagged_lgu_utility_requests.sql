-- Apply after 202610210001_overdue_utility_flags.sql from the Provincial Admin web repo.
-- A flag remains active until the Provincial Admin sets cleared_at.
create or replace function public.reject_flagged_lgu_utility_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.utility_overdue_flags
    where lgu_id = new.requested_by and cleared_at is null
  ) then
    raise exception 'Utility Request Restricted: your account has an active overdue utility flag.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_flagged_lgu_utility_request on public.resource_requests;
create trigger reject_flagged_lgu_utility_request
before insert on public.resource_requests
for each row execute function public.reject_flagged_lgu_utility_request();

-- The mobile app reads only its own active flags. Existing Provincial Admin
-- policies and the flag/unflag RPCs remain unchanged.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'utility_overdue_flags'
      and policyname = 'LGU reads own utility flags'
  ) then
    create policy "LGU reads own utility flags"
    on public.utility_overdue_flags for select to authenticated
    using (lgu_id = (select auth.uid()));
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'utility_overdue_flags'
     ) then
    alter publication supabase_realtime add table public.utility_overdue_flags;
  end if;
end;
$$;
