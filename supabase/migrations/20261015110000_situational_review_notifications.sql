-- Admin review of each LGU situational submission, including linked updates.
create or replace function public.review_lgu_situational_report(p_report_id uuid, p_decision text)
returns public.incident_report
language plpgsql security definer set search_path = '' as $$
declare
  reviewed public.incident_report%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_status = 'active'
      and p.role in ('national_admin', 'provincial_admin')
  ) then
    raise exception 'Only an active PDRRMO administrator can review this report.' using errcode = '42501';
  end if;
  if p_decision not in ('Verified', 'Rejected', 'In Progress', 'Resolved') then
    raise exception 'Invalid review decision.' using errcode = '23514';
  end if;

  update public.incident_report r
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now()
  where r.report_id = p_report_id
    and (r.report_type in ('situational_report', 'situational')
         or r.hazard_type like '[SITUATIONAL]%')
    and exists (
      select 1 from public.profiles submitter
      where submitter.id = r.user_id
        and submitter.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    )
  returning r.* into reviewed;
  if not found then
    raise exception 'The LGU situational report was not found.' using errcode = 'P0002';
  end if;
  return reviewed;
end $$;
revoke all on function public.review_lgu_situational_report(uuid,text) from public, anon;
grant execute on function public.review_lgu_situational_report(uuid,text) to authenticated;

create or replace function public.notify_lgu_situational_review()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
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

  if new.status = 'Verified' then
    notification_title := 'Situational Report Verified';
    notification_message := case when new.parent_report_id is not null
      then 'PDRRMO acknowledged and verified your linked situational update.'
      else 'PDRRMO acknowledged and verified your situational report.' end;
  else
    notification_title := 'Situational Report Rejected';
    notification_message := case when new.parent_report_id is not null
      then 'PDRRMO rejected your linked situational update.'
      else 'PDRRMO rejected your situational report.' end;
  end if;

  insert into public.notifications (user_id, target_role, type, title, message, is_read, created_at)
  values (new.user_id, 'lgu', 'Updates', notification_title,
          notification_message || ' [REF:' || new.report_id::text || ']', false, now());
  return new;
end $$;

drop trigger if exists notify_lgu_situational_review on public.incident_report;
create trigger notify_lgu_situational_review
after update of status on public.incident_report
for each row execute function public.notify_lgu_situational_review();
revoke all on function public.notify_lgu_situational_review() from public, anon, authenticated;

notify pgrst, 'reload schema';
