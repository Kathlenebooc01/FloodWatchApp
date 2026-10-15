-- Hotline ownership is per authenticated LGU account, even within one municipality.
alter table public.municipality_lgu_hotlines
  add column if not exists lgu_account_id uuid references public.profiles(id);

-- Historical rows have no creator ID. Assign only municipalities with exactly
-- one eligible LGU account; leave all ambiguous rows intact and unassigned.
with sole_owner as (
  select municipality_id, min(id::text)::uuid as account_id
  from public.profiles
  where role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
    and municipality_id is not null
  group by municipality_id
  having count(*) = 1
)
update public.municipality_lgu_hotlines h
set lgu_account_id = o.account_id
from sole_owner o
where h.municipality_id = o.municipality_id
  and h.lgu_account_id is null;

drop index if exists public.municipality_lgu_hotlines_unique_entry;
create unique index if not exists municipality_lgu_hotlines_unique_account_entry
  on public.municipality_lgu_hotlines (
    lgu_account_id,
    lower(btrim(department_name)),
    regexp_replace(hotline_number, '[^0-9+]', '', 'g')
  ) where lgu_account_id is not null;

create index if not exists municipality_lgu_hotlines_account_id_idx
  on public.municipality_lgu_hotlines (lgu_account_id);

create or replace function public.enforce_lgu_hotline_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_profile public.profiles%rowtype;
begin
  if tg_op = 'UPDATE' and
     (new.lgu_account_id is distinct from old.lgu_account_id or
      new.municipality_id is distinct from old.municipality_id) then
    raise exception 'Hotline owner and municipality cannot be changed.' using errcode = '42501';
  end if;

  if auth.uid() is null then
    return new; -- Trusted backend migration/service operations.
  end if;

  select * into owner_profile from public.profiles where id = auth.uid();
  if owner_profile.role in ('national_admin', 'provincial_admin') and tg_op = 'UPDATE' then
    return new; -- Preserve existing Provincial Admin editing rights.
  end if;
  if owner_profile.role not in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
     or owner_profile.municipality_id is null then
    raise exception 'Only an assigned LGU account can manage hotlines.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.lgu_account_id is not null and new.lgu_account_id <> auth.uid() then
      raise exception 'Cannot assign a hotline to another account.' using errcode = '42501';
    end if;
    new.lgu_account_id := auth.uid();
  elsif old.lgu_account_id is distinct from auth.uid() then
    raise exception 'Cannot edit another account''s hotline.' using errcode = '42501';
  end if;

  if new.municipality_id is distinct from owner_profile.municipality_id then
    raise exception 'Hotline municipality must match the LGU account.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists enforce_lgu_hotline_owner on public.municipality_lgu_hotlines;
create trigger enforce_lgu_hotline_owner
before insert or update on public.municipality_lgu_hotlines
for each row execute function public.enforce_lgu_hotline_owner();

revoke all on function public.enforce_lgu_hotline_owner() from public, anon, authenticated;

alter table public.municipality_lgu_hotlines enable row level security;

drop policy if exists "LGU can add own municipality hotlines" on public.municipality_lgu_hotlines;
drop policy if exists "LGU and provincial admins can read hotlines" on public.municipality_lgu_hotlines;
drop policy if exists "LGU and provincial admins can edit hotlines" on public.municipality_lgu_hotlines;
drop policy if exists "LGU and provincial admins can delete hotlines" on public.municipality_lgu_hotlines;

create policy "LGU can insert own hotlines"
on public.municipality_lgu_hotlines for insert to authenticated
with check (
  lgu_account_id = (select auth.uid())
  and exists (select 1 from public.profiles p
              where p.id = (select auth.uid())
                and p.role in ('lgu', 'lgu_frontliner', 'lgu_headmaster')
                and p.municipality_id = municipality_lgu_hotlines.municipality_id)
);

create policy "LGU can read own hotlines"
on public.municipality_lgu_hotlines for select to authenticated
using (lgu_account_id = (select auth.uid()));

create policy "LGU can update own hotlines"
on public.municipality_lgu_hotlines for update to authenticated
using (lgu_account_id = (select auth.uid()))
with check (lgu_account_id = (select auth.uid()));

create policy "LGU can delete own hotlines"
on public.municipality_lgu_hotlines for delete to authenticated
using (lgu_account_id = (select auth.uid()));

-- Preserve existing administrator access without granting it to another LGU.
create policy "Provincial admins can read hotlines"
on public.municipality_lgu_hotlines for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
              and p.role in ('national_admin', 'provincial_admin')));

create policy "Provincial admins can update hotlines"
on public.municipality_lgu_hotlines for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
              and p.role in ('national_admin', 'provincial_admin')))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid())
                   and p.role in ('national_admin', 'provincial_admin')));

create policy "Provincial admins can delete hotlines"
on public.municipality_lgu_hotlines for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
              and p.role in ('national_admin', 'provincial_admin')));
