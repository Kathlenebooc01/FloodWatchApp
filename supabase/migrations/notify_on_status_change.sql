-- Enable pg_net extension (needed to call edge functions from triggers)
create extension if not exists pg_net;

-- Function that calls the edge function when report status changes
create or replace function notify_report_status_change()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_url text;
  service_key text;
begin
  -- Only fire when status actually changes
  if OLD.status = NEW.status then
    return NEW;
  end if;

  -- Only fire for notifiable statuses
  if NEW.status not in ('Verified', 'Resolved', 'Rejected', 'ready_for_lgu') then
    return NEW;
  end if;

  edge_url    := current_setting('app.supabase_url', true) || '/functions/v1/notify-report-status';
  service_key := current_setting('app.service_role_key', true);

  -- Call the edge function asynchronously via pg_net
  perform net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := jsonb_build_object(
      'report_id',  NEW.report_id::text,
      'new_status', NEW.status,
      'old_status', OLD.status
    )
  );

  return NEW;
end;
$$;

-- Drop existing trigger if any
drop trigger if exists on_report_status_change on incident_report;

-- Create the trigger
create trigger on_report_status_change
  after update of status
  on incident_report
  for each row
  execute function notify_report_status_change();
