create or replace function private.dhuroje_cleanup_empty_conversations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted integer := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  delete from public.dhuroje_conversations c
  where not exists (
    select 1
    from public.dhuroje_messages m
    where m.conversation_id = c.id
  )
  and exists (
    select 1
    from public.dhuroje_conversation_members cm
    where cm.conversation_id = c.id
      and cm.user_id = v_user_id
  );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function private.dhuroje_cleanup_empty_conversations() from public;
grant execute on function private.dhuroje_cleanup_empty_conversations() to authenticated;

create or replace function public.dhuroje_cleanup_empty_conversations()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.dhuroje_cleanup_empty_conversations();
$$;

revoke execute on function public.dhuroje_cleanup_empty_conversations() from public, anon;
grant execute on function public.dhuroje_cleanup_empty_conversations() to authenticated;

-- Remove conversations that were created but never received a message.
delete from public.dhuroje_conversations c
where not exists (
  select 1
  from public.dhuroje_messages m
  where m.conversation_id = c.id
);