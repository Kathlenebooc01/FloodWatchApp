begin;
create or replace function public.assert_linkable_situational_report(p_report_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare parent public.incident_report%rowtype; actor public.profiles%rowtype;
begin
    select * into actor from public.profiles where id=p_actor_id and account_status='active';
    if not found or actor.role not in ('lgu','lgu_frontliner','lgu_headmaster') then
        raise exception 'An active LGU account is required.' using errcode='42501';
    end if;
    select * into parent from public.incident_report where report_id=p_report_id for update;
    if not found or parent.parent_report_id is not null
       or not (coalesce(parent.hazard_type like '[SITUATIONAL]%',false) or coalesce(parent.report_type in ('situational_report','situational'),false))
       or not exists (select 1 from public.profiles where id=parent.user_id and role in ('lgu','lgu_frontliner','lgu_headmaster')) then
        raise exception 'Select an existing main LGU situational report.' using errcode='23514';
    end if;
    if actor.municipality_id is null or parent.municipality_id is distinct from actor.municipality_id then
        raise exception 'You can only link to situational reports from your own LGU municipality.' using errcode='42501';
    end if;
    if parent.status is distinct from 'Verified' then
        raise exception 'This main report has not been accepted by PDRRMO/Admin. Wait for acceptance before creating an update.' using errcode='23514';
    end if;
end $$;
revoke all on function public.assert_linkable_situational_report(uuid,uuid) from public, anon, authenticated;

create or replace function public.enforce_situational_report_workflow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    parent public.incident_report%rowtype;
    is_situational boolean;
    actor_role text;
begin
    is_situational := coalesce(new.hazard_type like '[SITUATIONAL]%',false) or coalesce(new.report_type in ('situational_report','situational'),false);
    if tg_op = 'UPDATE' then
        is_situational := is_situational or coalesce(old.hazard_type like '[SITUATIONAL]%',false) or coalesce(old.report_type in ('situational_report','situational'),false);
    end if;
    if is_situational and auth.uid() is not null and pg_trigger_depth() = 1
       and ((tg_op = 'UPDATE' and new.status is distinct from old.status)
            or (new.status = 'Verified' and (tg_op = 'INSERT' or
                new.user_id is distinct from old.user_id or new.municipality_id is distinct from old.municipality_id or
                new.hazard_type is distinct from old.hazard_type or new.report_type is distinct from old.report_type))) then
        if not exists (select 1 from public.profiles where id=auth.uid() and account_status='active' and role in ('national_admin','provincial_admin')) then
            raise exception 'Only PDRRMO/Admin can change report acceptance.' using errcode='42501';
        end if;
    end if;
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
        perform public.assert_linkable_situational_report(new.parent_report_id,new.user_id);
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

create or replace function public.get_situational_report_context(p_report_id uuid)
returns table(report_id uuid, title text, current_status text, latest_update_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('lgu','lgu_frontliner','lgu_headmaster') and p.account_status='active') then
        raise exception 'An active LGU account is required.' using errcode='42501';
    end if;
    perform public.assert_linkable_situational_report(p_report_id,auth.uid());
    return query select r.report_id, regexp_replace(r.hazard_type, '^\[SITUATIONAL\]\s*', '', 'i'), r.situation_status, r.situation_updated_at
    from public.incident_report r join public.profiles p on p.id=r.user_id
    where r.report_id=p_report_id and r.parent_report_id is null
      and (r.hazard_type like '[SITUATIONAL]%' or r.report_type in ('situational_report','situational'))
      and p.role in ('lgu','lgu_frontliner','lgu_headmaster');
    if not found then raise exception 'The selected main situational report is no longer available.' using errcode='P0002'; end if;
end $$;

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
        perform public.assert_linkable_situational_report(p_parent_report_id,actor.id);
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

notify pgrst, 'reload schema';
commit;
