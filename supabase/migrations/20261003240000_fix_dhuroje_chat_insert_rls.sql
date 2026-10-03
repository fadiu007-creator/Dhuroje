-- Keep Dhuroje chat creation reproducible across local/CI/production databases.
-- The client calls the RPC as an authenticated user; the RPC performs the
-- participant authorization, while these policies permit the actual inserts.

drop policy if exists "dhuroje authenticated users create listing conversations"
on public.dhuroje_conversations;

create policy "dhuroje authenticated users create listing conversations"
on public.dhuroje_conversations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.dhuroje_listings l
    where l.id = listing_id
      and l.status in ('available','reserved')
  )
);

drop policy if exists "dhuroje authenticated users add conversation members"
on public.dhuroje_conversation_members;

create policy "dhuroje authenticated users add conversation members"
on public.dhuroje_conversation_members
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  or private.dhuroje_can_add_conversation_member(conversation_id, user_id)
);
