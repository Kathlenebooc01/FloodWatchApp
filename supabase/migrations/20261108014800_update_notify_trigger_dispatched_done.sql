-- Update the notify_report_status_change() trigger function to also fire
-- for 'Dispatched' and 'Done' statuses so the citizen gets a notification.
create or replace function notify_report_status_change()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_url text;
  service_key text;
begin
  if OLD.status = NEW.status then
    return NEW;
  end if;

  if NEW.status not in ('Verified', 'Resolved', 'Rejected', 'ready_for_lgu', 'Dispatched', 'Done') then
    return NEW;
  end if;

  edge_url    := current_setting('app.supabase_url', true) || '/functions/v1/notify-report-status';
  service_key := current_setting('app.service_role_key', true);

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
