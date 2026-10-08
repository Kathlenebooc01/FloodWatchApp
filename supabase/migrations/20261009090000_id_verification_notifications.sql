-- One durable notification per ID submission and final review decision.
alter table public.notifications add column if not exists event_key text;
create unique index if not exists notifications_event_key_unique
  on public.notifications (event_key) where event_key is not null;

create or replace function public.notify_id_verification_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  decision text;
  notification_title text;
  notification_message text;
begin
  if tg_op = 'INSERT' then
    decision := 'pending';
  elsif new.status is distinct from old.status then
    decision := lower(new.status);
  else
    return new;
  end if;

  if decision = 'pending' then
    notification_title := 'ID Verification Pending';
    notification_message := 'Your ID has been submitted successfully and is now pending PDRRMO approval. You will be notified once your verification has been reviewed.';
  elsif decision in ('approved', 'verified') then
    notification_title := 'ID Verification Approved';
    notification_message := 'Your ID verification has been approved by the PDRRMO. Your account is now verified.';
    update public.profiles set is_verified = true where id = new.user_id;
    decision := 'approved';
  elsif decision in ('rejected', 'declined') then
    notification_title := 'ID Verification Rejected';
    notification_message := 'Your ID verification was rejected by the PDRRMO. You may submit another ID.';
    update public.profiles set is_verified = false where id = new.user_id;
    decision := 'rejected';
  else
    return new;
  end if;

  insert into public.notifications (user_id, title, message, type, is_read, target_role, event_key)
  values (new.user_id, notification_title, notification_message, 'Updates', false, 'user',
          'id-verification:' || new.id_verification_id::text || ':' || decision)
  on conflict (event_key) where event_key is not null do nothing;
  return new;
end;
$$;

drop trigger if exists id_verification_notification on public.id_verification;
create trigger id_verification_notification
after insert or update of status on public.id_verification
for each row execute function public.notify_id_verification_change();
