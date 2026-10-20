-- Notify the submitting LGU once, after its support escalation is rejected.
-- The trigger runs in the same transaction as the status update, so a failed
-- update cannot leave behind a notification.
create or replace function public.notify_support_escalation_rejection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from 'Rejected'
     or old.status is not distinct from 'Rejected'
     or coalesce(new.remarks, '') not like 'Regional Support Escalation requested%'
     or new.profile_id is null then
    return new;
  end if;

  insert into public.notifications
    (user_id, target_role, type, notification_type, title, message,
     is_read, created_at, event_key)
  values
    (new.profile_id, 'lgu', 'Updates', 'Escalation Rejected',
     'Support Escalation Rejected',
     'Your support escalation request has been rejected by the Provincial Admin (PDRRMO).',
     false, now(), 'support-escalation-rejected:' || new.distress_id::text)
  on conflict (event_key) where event_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists notify_support_escalation_rejection on public.distress_signals;
create trigger notify_support_escalation_rejection
after update of status on public.distress_signals
for each row
execute function public.notify_support_escalation_rejection();
