-- Messaging RLS fix: avoid recursive membership policies and keep direct member authorization.
drop policy if exists "dhuroje conversation members can view membership" on public.dhuroje_conversation_members;
create policy "dhuroje conversation members can view membership"
on public.dhuroje_conversation_members for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "dhuroje conversation members view conversations" on public.dhuroje_conversations;
create policy "dhuroje conversation members view conversations"
on public.dhuroje_conversations for select to authenticated
using (exists (select 1 from public.dhuroje_conversation_members m where m.conversation_id=dhuroje_conversations.id and m.user_id=(select auth.uid())));

drop policy if exists "dhuroje messages members can read" on public.dhuroje_messages;
create policy "dhuroje messages members can read"
on public.dhuroje_messages for select to authenticated
using (exists (select 1 from public.dhuroje_conversation_members m where m.conversation_id=dhuroje_messages.conversation_id and m.user_id=(select auth.uid())));

drop policy if exists "dhuroje messages members can send" on public.dhuroje_messages;
create policy "dhuroje messages members can send"
on public.dhuroje_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and exists (select 1 from public.dhuroje_conversation_members m where m.conversation_id=dhuroje_messages.conversation_id and m.user_id=(select auth.uid())));

drop policy if exists "dhuroje authenticated users add conversation members" on public.dhuroje_conversation_members;
create policy "dhuroje authenticated users add conversation members"
on public.dhuroje_conversation_members for insert to authenticated
with check ((select auth.uid())=user_id or private.dhuroje_can_add_conversation_member(conversation_id,user_id));

create or replace function public.dhuroje_get_or_create_conversation(p_listing_id uuid,p_other_user_id uuid)
returns uuid language sql security invoker set search_path=''
as $$ select private.dhuroje_get_or_create_conversation(p_listing_id,p_other_user_id) $$;
revoke all on function public.dhuroje_get_or_create_conversation(uuid,uuid) from public,anon;
grant execute on function public.dhuroje_get_or_create_conversation(uuid,uuid) to authenticated;
