-- The dashboard acknowledges a linked update by changing that child report to Verified.
-- Store the acknowledgment separately from the Updates category shown in the app.
alter table public.notifications add column if not exists notification_type text;
alter table public.notifications add column if not exists event_key text;
create unique index if not exists notifications_event_key_unique
  on public.notifications (event_key) where event_key is not null;

create or replace function public.notify_linked_report_acknowledgment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent_title text;
  linked_parent_id uuid;
begin
  if new.status is distinct from 'Verified'
     or old.status is not distinct from new.status
     or not (coalesce(new.report_type in ('situational_report', 'situational'), false)
             or coalesce(new.hazard_type like '[SITUATIONAL]%', false)) then
    return new;
  end if;

  linked_parent_id := coalesce(
    new.parent_report_id,
    substring(new.description from '\[Linked Situational Report: ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]')::uuid,
    substring(new.description from '\[Linked Incident: ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]')::uuid
  );
  if linked_parent_id is null or linked_parent_id = new.report_id then return new; end if;

  select nullif(trim(regexp_replace(parent.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i')), '')
    into parent_title
  from public.incident_report parent
  where parent.report_id = linked_parent_id
    and parent.parent_report_id is null
    and parent.municipality_id is not distinct from new.municipality_id;
  if parent_title is null or not exists (
    select 1 from public.profiles submitter
    where submitter.id = new.user_id
      and submitter.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
  ) then
    return new;
  end if;

  insert into public.notifications
    (user_id, target_role, type, notification_type, title, message,
     is_read, created_at, event_key)
  values
    (new.user_id, 'lgu', 'Updates', 'Linked Report Acknowledgment',
     'Linked Report Acknowledged',
     'Your linked situational report update for "' || parent_title ||
       '" has been acknowledged by the Provincial Admin (PDRRMO).',
     false, now(), 'linked-report-acknowledged:' || new.report_id::text)
  on conflict (event_key) where event_key is not null do nothing;
  return new;
end $$;

drop trigger if exists notify_linked_report_acknowledgment on public.incident_report;
create trigger notify_linked_report_acknowledgment
after update of status on public.incident_report
for each row execute function public.notify_linked_report_acknowledgment();
revoke all on function public.notify_linked_report_acknowledgment() from public, anon, authenticated;

-- Do not invoke the generic status Edge Function for this same child review.
-- Keep it active for main reports and every unrelated status change.
do $$
begin
  if to_regprocedure('public.notify_report_status_change()') is not null
     and exists (select 1 from pg_trigger
                 where tgrelid = 'public.incident_report'::regclass
                   and tgname = 'on_report_status_change' and not tgisinternal) then
    drop trigger on_report_status_change on public.incident_report;
    create trigger on_report_status_change
      after update of status on public.incident_report
      for each row
      when (old.status is distinct from new.status
            and not ((new.parent_report_id is not null
                      or new.description like '%[Linked Situational Report:%'
                      or new.description like '%[Linked Incident:%')
                     and new.status = 'Verified'
                     and (coalesce(new.report_type in ('situational_report', 'situational'), false)
                          or coalesce(new.hazard_type like '[SITUATIONAL]%', false))))
      execute function public.notify_report_status_change();
  end if;
end $$;

-- The existing generic verification handler may also write Report Verified.
-- For a recently verified linked child, keep only the acknowledgment row.
-- Main-report verification and all other notification types pass through.
create or replace function public.suppress_linked_report_generic_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_role = 'lgu'
     and new.title = 'Report Verified'
     and new.message ilike 'Your situational report for % has been verified%'
     and exists (
       select 1
       from public.incident_report child
       join public.incident_report parent on parent.report_id = coalesce(
         child.parent_report_id,
         substring(child.description from '\[Linked Situational Report: ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]')::uuid,
         substring(child.description from '\[Linked Incident: ([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]')::uuid)
       join public.notifications acknowledgment
         on acknowledgment.event_key = 'linked-report-acknowledged:' || child.report_id::text
       where child.user_id = new.user_id
         and child.status = 'Verified'
         and coalesce(new.created_at, now()) between acknowledgment.created_at
                                                   and acknowledgment.created_at + interval '2 minutes'
         and lower(left(new.message, length(
               'Your situational report for ' || trim(regexp_replace(parent.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i'))
               || ' has been verified')))
             = lower('Your situational report for ' || trim(regexp_replace(parent.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i'))
               || ' has been verified')
     ) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists suppress_linked_report_generic_verification on public.notifications;
create trigger suppress_linked_report_generic_verification
before insert on public.notifications
for each row execute function public.suppress_linked_report_generic_verification();
revoke all on function public.suppress_linked_report_generic_verification() from public, anon, authenticated;
