-- An assigned LGU member may forward a verified citizen report once to each higher office.
create or replace function public.forward_verified_report(p_report_id uuid, p_target_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender public.profiles%rowtype;
  report public.incident_report%rowtype;
  recipient record;
begin
  select * into sender from public.profiles where id = auth.uid();
  if sender.role not in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
     or sender.account_status is distinct from 'active' then
    raise exception 'Only active LGU staff can forward reports.' using errcode = '42501';
  end if;
  if p_target_role not in ('provincial_admin', 'national_admin') then
    raise exception 'Invalid recipient role.' using errcode = '22023';
  end if;

  select * into report from public.incident_report where report_id = p_report_id;
  if report.report_id is null or report.municipality_id is distinct from sender.municipality_id
     or report.status not in ('Verified', 'Dispatched', 'Done')
     or report.report_type not in ('quick_snap', 'moderate_report', 'general_inquiries')
     or not exists (select 1 from public.profiles p where p.id = report.user_id and p.role = 'citizen') then
    raise exception 'Report is not an eligible verified citizen report.' using errcode = '42501';
  end if;

  for recipient in
    select p.id from public.profiles p
    where p.role = p_target_role and p.account_status = 'active'
  loop
    insert into public.notifications
      (user_id, target_role, type, title, message, is_read, created_at, event_key)
    values
      (recipient.id, p_target_role, 'Updates', 'Verified report forwarded',
       'LGU forwarded verified report #' || left(report.report_id::text, 8) ||
       ' (' || coalesce(report.hazard_type, report.report_type) || '). [REPORT:' || report.report_id::text || ']',
       false, now(),
       'manual-forward:' || report.report_id::text || ':' || p_target_role || ':' || recipient.id::text)
    on conflict (event_key) where event_key is not null do nothing;
  end loop;
end;
$$;

revoke all on function public.forward_verified_report(uuid, text) from public, anon;
grant execute on function public.forward_verified_report(uuid, text) to authenticated;
