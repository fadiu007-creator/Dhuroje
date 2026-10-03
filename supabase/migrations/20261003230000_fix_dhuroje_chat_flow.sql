-- Robust Dhuroje chat creation and non-recursive conversation RLS.
drop policy if exists "dhuroje conversation members view conversations" on public.dhuroje_conversations;
create policy "dhuroje conversation members view conversations"
on public.dhuroje_conversations
for select
to authenticated
using (
  (select private.dhuroje_user_is_conversation_member(id, (select auth.uid())))
);

create or replace function private.dhuroje_get_or_create_conversation(
  p_listing_id uuid,
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_listing_owner uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then raise exception 'invalid_recipient'; end if;

  select l.owner_id into v_listing_owner
  from public.dhuroje_listings l
  where l.id=p_listing_id and l.status in ('available','reserved');

  if v_listing_owner is null then raise exception 'listing_unavailable'; end if;

  if v_user_id=v_listing_owner then
    if not exists (
      select 1 from public.dhuroje_claims cl
      where cl.listing_id=p_listing_id and cl.claimant_id=p_other_user_id
        and cl.status in ('pending','accepted')
    ) then raise exception 'recipient_not_authorized'; end if;
  elsif p_other_user_id<>v_listing_owner then
    raise exception 'recipient_not_authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_listing_id::text || ':' ||
    least(v_user_id::text,p_other_user_id::text) || ':' ||
    greatest(v_user_id::text,p_other_user_id::text),0));

  select c.id into v_conversation_id
  from public.dhuroje_conversations c
  join public.dhuroje_conversation_members m1 on m1.conversation_id=c.id and m1.user_id=v_user_id
  join public.dhuroje_conversation_members m2 on m2.conversation_id=c.id and m2.user_id=p_other_user_id
  where c.listing_id=p_listing_id
  limit 1;

  if v_conversation_id is null then
    insert into public.dhuroje_conversations(listing_id) values(p_listing_id)
    returning id into v_conversation_id;
    insert into public.dhuroje_conversation_members(conversation_id,user_id)
    values(v_conversation_id,v_user_id),(v_conversation_id,p_other_user_id);
  end if;
  return v_conversation_id;
end;
$$;

revoke execute on function private.dhuroje_get_or_create_conversation(uuid,uuid) from public;
grant execute on function private.dhuroje_get_or_create_conversation(uuid,uuid) to authenticated;

create or replace function public.dhuroje_get_or_create_conversation(p_listing_id uuid,p_other_user_id uuid)
returns uuid language sql security invoker set search_path=''
as $$ select private.dhuroje_get_or_create_conversation(p_listing_id,p_other_user_id) $$;

revoke execute on function public.dhuroje_get_or_create_conversation(uuid,uuid) from public,anon;
grant execute on function public.dhuroje_get_or_create_conversation(uuid,uuid) to authenticated;