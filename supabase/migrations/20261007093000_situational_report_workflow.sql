begin;

alter table public.incident_report
    add column if not exists parent_report_id uuid,
    add column if not exists situation_status text,
    add column if not exists situation_updated_at timestamptz;

-- Operational status is separate from the existing review/AI status.
update public.incident_report r
set situation_status = case lower(trim(coalesce(substring(r.description from '\[Field Status: ([^\]]+)\]'), r.status)))
        when 'ongoing' then 'Ongoing' when 'resolved' then 'Resolved'
        when 'pending escalation' then 'Pending Escalation' else null end,
    situation_updated_at = coalesce(r.created_at, now())
where (r.hazard_type like '[SITUATIONAL]%' or r.report_type in ('situational_report', 'situational'))
  and r.situation_updated_at is null;

-- Preserve previously saved situational links. Citizen-incident links are not
-- converted into situational parent relationships.
update public.incident_report child
set parent_report_id = parent.report_id
from public.incident_report parent
where child.parent_report_id is null and child.report_id <> parent.report_id
  and substring(child.description from '\[Linked Situational Report: ([0-9a-fA-F-]{36})\]') = parent.report_id::text
  and (child.hazard_type like '[SITUATIONAL]%' or child.report_type in ('situational_report', 'situational'))
  and (parent.hazard_type like '[SITUATIONAL]%' or parent.report_type in ('situational_report', 'situational'));

-- Flatten legacy nested updates onto their main report, without following cycles.
with recursive ancestry as (
    select report_id as child_id, parent_report_id as ancestor_id, array[report_id] as visited
    from public.incident_report where parent_report_id is not null
    union all
    select a.child_id, p.parent_report_id, a.visited || p.report_id
    from ancestry a join public.incident_report p on p.report_id = a.ancestor_id
    where p.parent_report_id is not null and not p.report_id = any(a.visited)
), roots as (
    select a.child_id, a.ancestor_id from ancestry a
    join public.incident_report p on p.report_id = a.ancestor_id
    where p.parent_report_id is null
)
update public.incident_report r set parent_report_id = roots.ancestor_id
from roots where r.report_id = roots.child_id;

-- Reject inconsistent legacy cycles rather than silently losing relationships.
do $$ begin
    if exists (select 1 from public.incident_report c join public.incident_report p on p.report_id=c.parent_report_id
               where p.parent_report_id is not null) then
        raise exception 'Existing situational links contain a cycle. Resolve it before applying this migration.';
    end if;
end $$;

with latest as (
    select distinct on (parent_report_id) parent_report_id, situation_status, situation_updated_at
    from public.incident_report where parent_report_id is not null and situation_status is not null
    order by parent_report_id, created_at desc nulls last, report_id desc
)
update public.incident_report main
set situation_status = latest.situation_status, situation_updated_at = latest.situation_updated_at
from latest where main.report_id = latest.parent_report_id
  and coalesce(main.situation_updated_at, '-infinity') <= latest.situation_updated_at;

do $$ begin
    if not exists (select 1 from pg_constraint where conname='incident_report_parent_report_fk' and conrelid='public.incident_report'::regclass) then
        alter table public.incident_report add constraint incident_report_parent_report_fk
            foreign key (parent_report_id) references public.incident_report(report_id) on delete restrict;
    end if;
    if not exists (select 1 from pg_constraint where conname='incident_report_situation_status_check' and conrelid='public.incident_report'::regclass) then
        alter table public.incident_report add constraint incident_report_situation_status_check
            check (situation_status is null or situation_status in ('Ongoing','Resolved','Pending Escalation'));
    end if;
    if not exists (select 1 from pg_constraint where conname='incident_report_parent_not_self' and conrelid='public.incident_report'::regclass) then
        alter table public.incident_report add constraint incident_report_parent_not_self check (parent_report_id is distinct from report_id);
    end if;
end $$;
create index if not exists incident_report_parent_report_idx on public.incident_report(parent_report_id) where parent_report_id is not null;

create or replace function public.enforce_situational_report_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    parent public.incident_report%rowtype;
    is_situational boolean;
    actor_role text;
begin
    is_situational := coalesce(new.hazard_type like '[SITUATIONAL]%',false) or coalesce(new.report_type in ('situational_report','situational'),false);
    if tg_op = 'UPDATE' then
        -- Updates are immutable status-history entries. Review fields remain editable.
        if auth.uid() is not null and pg_trigger_depth() = 1
           and (old.parent_report_id is not null or old.situation_updated_at is not null)
           and (new.parent_report_id is distinct from old.parent_report_id
                or new.situation_status is distinct from old.situation_status
                or new.situation_updated_at is distinct from old.situation_updated_at
                or (old.parent_report_id is not null and new.hazard_type is distinct from old.hazard_type)) then
            raise exception 'Submit a linked situational update to change its operational status.' using errcode='23514';
        end if;
        return new;
    end if;
    if not is_situational then
        if new.parent_report_id is not null or new.situation_status is not null then
            raise exception 'Only situational reports can have a situational parent or status.' using errcode='23514';
        end if;
        return new;
    end if;
    select p.role into actor_role from public.profiles p where p.id = new.user_id and p.account_status='active';
    if actor_role is null or actor_role not in ('lgu','lgu_frontliner','lgu_headmaster') then
        raise exception 'An active LGU account is required to submit situational reports.' using errcode='42501';
    end if;
    if auth.uid() is not null and new.user_id is distinct from auth.uid() then
        raise exception 'You can only submit reports as your own LGU account.' using errcode='42501';
    end if;
    new.situation_status := coalesce(new.situation_status, substring(new.description from '\[Field Status: ([^\]]+)\]'));
    if new.situation_status is null or new.situation_status not in ('Ongoing','Resolved','Pending Escalation') then
        raise exception 'Select a valid situational status.' using errcode='23514';
    end if;
    new.situation_updated_at := clock_timestamp();
    if new.parent_report_id is not null then
        -- Serialize simultaneous updates to the same main report.
        select r.* into parent from public.incident_report r where r.report_id=new.parent_report_id for update;
        if not found or parent.parent_report_id is not null
           or not (coalesce(parent.hazard_type like '[SITUATIONAL]%',false) or coalesce(parent.report_type in ('situational_report','situational'),false))
           or not exists (select 1 from public.profiles p where p.id=parent.user_id and p.role in ('lgu','lgu_frontliner','lgu_headmaster')) then
            raise exception 'Select an existing main LGU situational report.' using errcode='23514';
        end if;
        if new.situation_status = parent.situation_status then
            raise exception 'This is already the current status. Select a different status.' using errcode='23514';
        end if;
        new.hazard_type := parent.hazard_type;
        new.municipality_id := parent.municipality_id;
        update public.incident_report set situation_status=new.situation_status, situation_updated_at=new.situation_updated_at
        where report_id=parent.report_id;
    end if;
    return new;
end $$;
revoke all on function public.enforce_situational_report_workflow() from public, anon;
drop trigger if exists enforce_situational_report_workflow on public.incident_report;
create trigger enforce_situational_report_workflow before insert or update on public.incident_report
for each row execute function public.enforce_situational_report_workflow();

create or replace function public.get_situational_report_context(p_report_id uuid)
returns table(report_id uuid, title text, current_status text, latest_update_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('lgu','lgu_frontliner','lgu_headmaster') and p.account_status='active') then
        raise exception 'An active LGU account is required.' using errcode='42501';
    end if;
    return query select r.report_id, regexp_replace(r.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i'), r.situation_status, r.situation_updated_at
    from public.incident_report r join public.profiles p on p.id=r.user_id
    where r.report_id=p_report_id and r.parent_report_id is null
      and (r.hazard_type like '[SITUATIONAL]%' or r.report_type in ('situational_report','situational'))
      and p.role in ('lgu','lgu_frontliner','lgu_headmaster');
    if not found then raise exception 'The selected main situational report is no longer available.' using errcode='P0002'; end if;
end $$;
revoke all on function public.get_situational_report_context(uuid) from public, anon;
grant execute on function public.get_situational_report_context(uuid) to authenticated;

create or replace function public.submit_situational_report(
    p_title text, p_status text, p_description text, p_parent_report_id uuid default null,
    p_document_path text default null, p_expected_status text default null
)
returns setof public.incident_report
language plpgsql security definer set search_path = '' as $$
declare
    actor public.profiles%rowtype;
    parent public.incident_report%rowtype;
    report_title text;
    report_description text;
    municipality uuid;
begin
    select p.* into actor from public.profiles p where p.id=auth.uid();
    if not found or actor.role not in ('lgu','lgu_frontliner','lgu_headmaster') or actor.account_status is distinct from 'active' then
        raise exception 'An active LGU account is required.' using errcode='42501';
    end if;
    if p_status is null or p_status not in ('Ongoing','Resolved','Pending Escalation') then
        raise exception 'Select a valid situational status.' using errcode='23514';
    end if;
    if nullif(trim(p_description),'') is null then raise exception 'Description is required.' using errcode='23514'; end if;
    report_title := trim(p_title);
    municipality := actor.municipality_id;
    if p_parent_report_id is not null then
        select r.* into parent from public.incident_report r where r.report_id=p_parent_report_id for update;
        if not found or parent.parent_report_id is not null then
            raise exception 'The selected main situational report is no longer available.' using errcode='P0002';
        end if;
        if parent.situation_status is distinct from p_expected_status then
            raise exception 'The report status changed while you were editing. Review its current status and choose again.' using errcode='40001';
        end if;
        report_title := regexp_replace(parent.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i');
        municipality := parent.municipality_id;
    end if;
    if nullif(report_title,'') is null then raise exception 'Subject or title is required.' using errcode='23514'; end if;
    if municipality is null then raise exception 'Your LGU account needs a municipality before submitting a report.' using errcode='23514'; end if;
    -- Strip reserved metadata from user text. Relationship and status come from typed parameters.
    report_description := '[Field Status: ' || p_status || ']' || E'\n' || trim(regexp_replace(p_description, '\[(Linked Situational Report|Linked Incident|Field Status|Attached Document):[^\]]*\]', '', 'g'));
    if p_parent_report_id is not null then report_description := report_description || E'\n\n[Linked Situational Report: ' || p_parent_report_id || ']'; end if;
    if nullif(trim(p_document_path),'') is not null then
        if p_document_path ~ '[\[\]\r\n]' then raise exception 'Invalid document path.' using errcode='23514'; end if;
        report_description := report_description || E'\n\n[Attached Document: ' || p_document_path || ']';
    end if;
    return query insert into public.incident_report(user_id, report_type, hazard_type, description, status, municipality_id, parent_report_id, situation_status)
    values(actor.id, 'situational_report', '[SITUATIONAL] ' || report_title, report_description, 'Pending_AI', municipality, p_parent_report_id, p_status)
    returning *;
end $$;
revoke all on function public.submit_situational_report(text,text,text,uuid,text,text) from public, anon;
grant execute on function public.submit_situational_report(text,text,text,uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
