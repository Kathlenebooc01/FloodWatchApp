-- The review trigger owns LGU situational notifications. Keep one event per report and decision.
create or replace function public.notify_lgu_situational_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is not distinct from old.status
     or new.status not in ('Verified', 'Rejected')
     or not (coalesce(new.report_type in ('situational_report', 'situational'), false)
             or coalesce(new.hazard_type like '[SITUATIONAL]%', false))
     or not exists (
       select 1 from public.profiles p where p.id = new.user_id
         and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
     ) then
    return new;
  end if;

  insert into public.notifications
    (user_id, target_role, type, title, message, is_read, created_at, event_key)
  values
    (new.user_id, 'lgu', 'Updates',
     case when new.status = 'Verified' then 'Situational Report Verified'
          else 'Situational Report Rejected' end,
     case when new.status = 'Verified'
          then 'Your situational report has been accepted and verified by the Provincial Admin (PDRRMO).'
          else 'Your situational report was rejected by the Provincial Admin (PDRRMO).' end,
     false, now(),
     'situational-review:' || new.report_id::text || ':' || lower(new.status))
  on conflict (event_key) where event_key is not null do nothing;
  return new;
end $$;

-- The older status trigger invokes notify-report-status. Its non-situational
-- notifications remain active; situational reviews are handled above.
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
            and not (coalesce(new.report_type in ('situational_report', 'situational'), false)
                     or coalesce(new.hazard_type like '[SITUATIONAL]%', false)))
      execute function public.notify_report_status_change();
  end if;
end $$;

-- Suppress the legacy LGU message if another deployed handler still writes it.
-- This matches only the old generic situational verification text.
create or replace function public.suppress_legacy_situational_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_role = 'lgu' and new.title = 'Report Verified'
     and new.message ilike 'Your situational report for % has been verified%' then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists suppress_legacy_situational_verification on public.notifications;
create trigger suppress_legacy_situational_verification
before insert on public.notifications
for each row execute function public.suppress_legacy_situational_verification();
revoke all on function public.suppress_legacy_situational_verification() from public, anon, authenticated;
