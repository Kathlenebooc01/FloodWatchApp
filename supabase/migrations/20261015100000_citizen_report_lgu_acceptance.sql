-- Citizen reports require an explicit acceptance by their assigned LGU.
update public.incident_report
set status = 'Pending'
where report_type in ('quick_snap', 'general_inquiries', 'moderate_report')
  and status = 'Pending_AI';

create or replace function public.enforce_citizen_report_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  is_citizen_report boolean;
begin
  is_citizen_report := new.report_type in ('quick_snap', 'general_inquiries', 'moderate_report');
  if tg_op = 'UPDATE' then
    is_citizen_report := is_citizen_report or old.report_type in ('quick_snap', 'general_inquiries', 'moderate_report');
  end if;
  if not is_citizen_report then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.user_id = auth.uid() then
      select * into actor from public.profiles where id = auth.uid();
      if actor.role is null or actor.role not in ('lgu', 'lgu_frontliner', 'lgu_headmaster', 'national_admin', 'provincial_admin') then
        new.status := 'Pending';
      end if;
    end if;
    return new;
  end if;

  -- Documentation is stored in description; block both drafts and completed
  -- documentation before acceptance, including direct API updates.
  if new.description is distinct from old.description
     and new.description ~ '\[DOCUMENTATION STATUS: (IN PROGRESS|COMPLETED)\]'
     and old.status is distinct from 'Verified' then
    raise exception 'Accept the report before creating documentation.' using errcode = '23514';
  end if;

  if new.description is distinct from old.description
     and new.description ~ '\[DOCUMENTATION STATUS: (IN PROGRESS|COMPLETED)\]'
     and auth.uid() is not null then
    select * into actor from public.profiles where id = auth.uid();
    if actor.role is null or actor.role not in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
       or actor.account_status is distinct from 'active'
       or actor.municipality_id is distinct from old.municipality_id then
      raise exception 'Only the assigned LGU can create documentation.' using errcode = '42501';
    end if;
  end if;

  if new.status in ('Verified', 'Rejected')
     and new.status is distinct from old.status
     and auth.uid() is not null then
    select * into actor from public.profiles where id = auth.uid();
    if actor.role is null or actor.role not in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
       or actor.account_status is distinct from 'active'
       or actor.municipality_id is null
       or actor.municipality_id is distinct from old.municipality_id
       or new.municipality_id is distinct from old.municipality_id
       or old.status not in ('Pending', 'Pending_AI') then
      raise exception 'Only the assigned LGU can review a pending report.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_citizen_report_acceptance on public.incident_report;
create trigger enforce_citizen_report_acceptance
before insert or update on public.incident_report
for each row execute function public.enforce_citizen_report_acceptance();

revoke all on function public.enforce_citizen_report_acceptance() from public, anon, authenticated;
