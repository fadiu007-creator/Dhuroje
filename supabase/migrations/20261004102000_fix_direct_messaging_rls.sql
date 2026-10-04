-- Fix Dhuroje direct messaging permissions and remove RLS dependency on private schema helpers.
grant usage on schema private to authenticated;

drop policy if exists "dhuroje authenticated users add conversation members"
on public.dhuroje_conversation_members;

create policy "dhuroje authenticated users add conversation members"
on public.dhuroje_conversation_members
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.dhuroje_conversations c
    join public.dhuroje_listings l on l.id = c.listing_id
    where c.id = conversation_id
      and l.status in ('available','reserved')
      and (
        l.owner_id = user_id
        or exists (
          select 1
          from public.dhuroje_claims cl
          where cl.listing_id = l.id
            and cl.claimant_id = user_id
            and cl.status in ('pending','accepted')
        )
      )
  )
);

create or replace function public.dhuroje_get_or_create_conversation(
  p_listing_id uuid,
  p_other_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_owner uuid;
  v_id uuid;
begin
  if v_user_id is null or p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'invalid_participants';
  end if;

  select owner_id into v_owner
  from public.dhuroje_listings
  where id = p_listing_id
    and status in ('available','reserved');

  if v_owner is null then
    raise exception 'listing_unavailable';
  end if;

  -- A visitor may message the listing owner without first requesting the item.
  -- An owner may message a claimant only after that user has requested the item.
  if v_user_id <> v_owner and p_other_user_id <> v_owner then
    raise exception 'recipient_not_authorized';
  end if;

  if v_user_id = v_owner and not exists (
    select 1
    from public.dhuroje_claims
    where listing_id = p_listing_id
      and claimant_id = p_other_user_id
      and status in ('pending','accepted')
  ) then
    raise exception 'recipient_not_authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_listing_id::text || ':' ||
    least(v_user_id::text,p_other_user_id::text) || ':' ||
    greatest(v_user_id::text,p_other_user_id::text), 0
  ));

  select c.id into v_id
  from public.dhuroje_conversations c
  join public.dhuroje_conversation_members a
    on a.conversation_id=c.id and a.user_id=v_user_id
  join public.dhuroje_conversation_members b
    on b.conversation_id=c.id and b.user_id=p_other_user_id
  where c.listing_id=p_listing_id
  limit 1;

  if v_id is null then
    insert into public.dhuroje_conversations(listing_id)
    values(p_listing_id)
    returning id into v_id;

    insert into public.dhuroje_conversation_members(conversation_id,user_id)
    values(v_id,v_user_id),(v_id,p_other_user_id);
  end if;

  return v_id;
end;
$$;

revoke all on function public.dhuroje_get_or_create_conversation(uuid,uuid)
from public, anon;
grant execute on function public.dhuroje_get_or_create_conversation(uuid,uuid)
to authenticated;
