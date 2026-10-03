-- Fix recursive RLS on Dhuroje conversation membership and allow
-- messaging directly from a listing without requiring a claim.

create or replace function private.dhuroje_user_is_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.dhuroje_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = p_user_id
  )
$function$;

revoke execute on function private.dhuroje_user_is_conversation_member(uuid, uuid) from public;
grant execute on function private.dhuroje_user_is_conversation_member(uuid, uuid) to authenticated;

drop policy if exists "dhuroje conversation members view membership" on public.dhuroje_conversation_members;
create policy "dhuroje conversation members view membership"
on public.dhuroje_conversation_members
for select
to authenticated
using (
  (select private.dhuroje_user_is_conversation_member(conversation_id, (select auth.uid())))
);

drop policy if exists "dhuroje members view messages" on public.dhuroje_messages;
create policy "dhuroje members view messages"
on public.dhuroje_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.dhuroje_conversation_members m
    where m.conversation_id = dhuroje_messages.conversation_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists "dhuroje members send messages" on public.dhuroje_messages;
create policy "dhuroje members send messages"
on public.dhuroje_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.dhuroje_conversation_members m
    where m.conversation_id = dhuroje_messages.conversation_id
      and m.user_id = (select auth.uid())
  )
);
