create or replace function public.dhuroje_accept_claim(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null then raise exception 'Duhet të jesh i kyçur'; end if;
  select c.listing_id, l.owner_id into v_listing_id, v_owner_id
  from public.dhuroje_claims c join public.dhuroje_listings l on l.id=c.listing_id
  where c.id=p_claim_id and c.status='pending'
  for update of c, l;
  if v_listing_id is null or v_owner_id<>auth.uid() then raise exception 'Kjo kërkesë nuk mund të pranohet'; end if;
  update public.dhuroje_claims set status='accepted' where id=p_claim_id and status='pending';
  update public.dhuroje_claims set status='declined' where listing_id=v_listing_id and status='pending' and id<>p_claim_id;
  update public.dhuroje_listings set status='reserved' where id=v_listing_id and owner_id=auth.uid() and status='available';
  return true;
end;
$$;
revoke all on function public.dhuroje_accept_claim(uuid) from public, anon;
grant execute on function public.dhuroje_accept_claim(uuid) to authenticated;