-- Give the LGU submitter one explicit notification when a linked update is verified.
alter table public.notifications add column if not exists event_key text;
create unique index if not exists notifications_event_key_unique
  on public.notifications (event_key) where event_key is not null;

create or replace function public.notify_lgu_situational_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  is_linked_update boolean;
  notification_title text;
  notification_message text;
begin
  if new.status is not distinct from old.status or new.status not in ('Verified', 'Rejected')
     or not (new.report_type in ('situational_report', 'situational')
             or new.hazard_type like '[SITUATIONAL]%') then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p where p.id = new.user_id
      and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
  ) then
    return new;
  end if;

  is_linked_update := new.parent_report_id is not null
    or position('[Linked Situational Report:' in coalesce(new.description, '')) > 0
    or position('[Linked Incident:' in coalesce(new.description, '')) > 0;
  if new.status = 'Verified' then
    notification_title := case when is_linked_update
      then 'Linked Report Update Verified' else 'Situational Report Verified' end;
    notification_message := case when is_linked_update
      then 'PDRRMO acknowledged and verified your linked report update.'
      else 'PDRRMO acknowledged and verified your situational report.' end;
  else
    notification_title := case when is_linked_update
      then 'Linked Report Update Rejected' else 'Situational Report Rejected' end;
    notification_message := case when is_linked_update
      then 'PDRRMO rejected your linked report update.'
      else 'PDRRMO rejected your situational report.' end;
  end if;

  insert into public.notifications
    (user_id, target_role, type, title, message, is_read, created_at, event_key)
  values
    (new.user_id, 'lgu', 'Updates', notification_title,
     notification_message || ' [REF:' || new.report_id::text || ']', false, now(),
     'situational-review:' || new.report_id::text || ':' || lower(new.status))
  on conflict (event_key) where event_key is not null do nothing;
  return new;
end $$;

drop trigger if exists notify_lgu_situational_review on public.incident_report;
create trigger notify_lgu_situational_review
after update of status on public.incident_report
for each row execute function public.notify_lgu_situational_review();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
