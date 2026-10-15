-- The existing Report Verified notification is the one LGU users should keep.
-- Remove only the additional notification created by this review trigger.
drop trigger if exists notify_lgu_situational_review on public.incident_report;
drop function if exists public.notify_lgu_situational_review();

-- Undo the earlier migration's filter on the general status handler. Other
-- status notifications, including the existing Report Verified path, continue.
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
      when (old.status is distinct from new.status)
      execute function public.notify_report_status_change();
  end if;
end $$;

-- The earlier migration blocked the correct Report Verified row. Remove that
-- safeguard without changing any other notification insert behavior.
drop trigger if exists suppress_legacy_situational_verification on public.notifications;
drop function if exists public.suppress_legacy_situational_verification();

-- Remove historical REF notifications only when a verified situational report
-- and exactly one matching Report Verified notification identify the same event.
-- Ambiguous or unmatched rows are deliberately left for manual review.
with candidates as (
  select duplicate.id,
         count(correct.id) as matching_notifications
  from public.notifications duplicate
  join public.incident_report report
    on report.report_id::text = substring(duplicate.message from '\[REF:([0-9a-fA-F-]{36})\]')
   and report.user_id = duplicate.user_id
   and report.status = 'Verified'
   and report.reviewed_at between duplicate.created_at - interval '2 minutes'
                              and duplicate.created_at + interval '2 minutes'
   and (report.report_type in ('situational_report', 'situational')
        or report.hazard_type like '[SITUATIONAL]%')
  join public.notifications correct
    on correct.user_id = duplicate.user_id
   and correct.target_role = duplicate.target_role
   and correct.title = 'Report Verified'
   and correct.type = 'Updates'
   and correct.created_at between duplicate.created_at - interval '2 minutes'
                              and duplicate.created_at + interval '2 minutes'
   and lower(left(correct.message, length(
         'Your situational report for ' || trim(regexp_replace(report.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i'))
         || ' has been verified')))
       = lower('Your situational report for ' || trim(regexp_replace(report.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i'))
         || ' has been verified')
  where duplicate.target_role = 'lgu'
    and duplicate.title = 'Situational Report Verified'
    and duplicate.type = 'Updates'
    and duplicate.message like 'PDRRMO acknowledged and verified your situational report. [REF:%]'
    and (duplicate.event_key is null or duplicate.event_key =
         'situational-review:' || report.report_id::text || ':verified')
    and not exists (
      select 1 from public.incident_report other_report
      where other_report.report_id <> report.report_id
        and other_report.user_id = report.user_id
        and other_report.status = 'Verified'
        and other_report.reviewed_at between duplicate.created_at - interval '2 minutes'
                                         and duplicate.created_at + interval '2 minutes'
        and lower(trim(regexp_replace(other_report.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i')))
            = lower(trim(regexp_replace(report.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i')))
    )
  group by duplicate.id
)
delete from public.notifications n
using candidates c
where n.id = c.id and c.matching_notifications = 1;
