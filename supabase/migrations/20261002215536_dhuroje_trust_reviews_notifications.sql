-- Dhuroje trust, reviews and notification workflow
create table if not exists public.dhuroje_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  listing_id uuid references public.dhuroje_listings(id) on delete cascade,
  claim_id uuid references public.dhuroje_claims(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.dhuroje_notifications enable row level security;
drop policy if exists "dhuroje users view own notifications" on public.dhuroje_notifications;
create policy "dhuroje users view own notifications" on public.dhuroje_notifications for select to authenticated using ((select auth.uid())=recipient_id);
drop policy if exists "dhuroje users mark own notifications read" on public.dhuroje_notifications;
create policy "dhuroje users mark own notifications read" on public.dhuroje_notifications for update to authenticated using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);
create index if not exists dhuroje_notifications_recipient_idx on public.dhuroje_notifications(recipient_id,created_at desc);

alter table public.dhuroje_reviews enable row level security;
create unique index if not exists dhuroje_reviews_one_per_listing_pair on public.dhuroje_reviews(reviewer_id,reviewed_id,listing_id);
drop policy if exists "dhuroje public view reviews" on public.dhuroje_reviews;
create policy "dhuroje public view reviews" on public.dhuroje_reviews for select to anon,authenticated using (true);
drop policy if exists "dhuroje participants create completed reviews" on public.dhuroje_reviews;
create policy "dhuroje participants create completed reviews" on public.dhuroje_reviews for insert to authenticated
with check ((select auth.uid())=reviewer_id and exists (
 select 1 from public.dhuroje_pickups p where p.listing_id=dhuroje_reviews.listing_id and p.status='completed'
 and ((p.owner_id=(select auth.uid()) and p.claimant_id=reviewed_id) or (p.claimant_id=(select auth.uid()) and p.owner_id=reviewed_id))
));

create schema if not exists private;

create or replace function private.dhuroje_notify_claim()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_title text;
begin
 select owner_id,title into v_owner,v_title from public.dhuroje_listings where id=new.listing_id;
 if tg_op='INSERT' then
   insert into public.dhuroje_notifications(recipient_id,type,title,body,listing_id,claim_id) values(v_owner,'claim','Kërkesë e re','Dikush kërkoi: '||coalesce(v_title,'dhuratën'),new.listing_id,new.id);
 elsif old.status is distinct from new.status and new.status in ('accepted','declined') then
   insert into public.dhuroje_notifications(recipient_id,type,title,body,listing_id,claim_id)
   values(new.claimant_id,'claim_status',case when new.status='accepted' then 'Kërkesa u pranua' else 'Kërkesa u refuzua' end,coalesce(v_title,'Dhurata'),new.listing_id,new.id);
 end if;
 return new;
end $$;

create or replace function private.dhuroje_notify_pickup()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text;
begin
 select title into v_title from public.dhuroje_listings where id=new.listing_id;
 if tg_op='INSERT' then
   insert into public.dhuroje_notifications(recipient_id,type,title,body,listing_id,claim_id) values(new.claimant_id,'pickup','Propozohet marrja','Dhuruesi ka propozuar një orar për: '||coalesce(v_title,'dhuratën'),new.listing_id,new.claim_id);
 elsif old.status is distinct from new.status then
   if new.status='confirmed' then
     insert into public.dhuroje_notifications(recipient_id,type,title,body,listing_id,claim_id) values(new.owner_id,'pickup','Marrja u konfirmua','Marrja për '||coalesce(v_title,'dhuratën')||' u konfirmua.',new.listing_id,new.claim_id);
   elsif new.status='completed' then
     insert into public.dhuroje_notifications(recipient_id,type,title,body,listing_id,claim_id) values(new.claimant_id,'completed','Dhuroja u përfundua','Tani mund të vlerësoni njëri-tjetrin.',new.listing_id,new.claim_id);
   end if;
 end if;
 return new;
end $$;

create or replace function private.dhuroje_notify_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.dhuroje_notifications(recipient_id,type,title,body,listing_id) values(new.reviewed_id,'review','Vlerësim i ri','Ke marrë një vlerësim të ri në Dhuroje.',new.listing_id);
 return new;
end $$;

create or replace function private.dhuroje_notify_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient uuid; v_listing uuid;
begin
 select cm.user_id into v_recipient from public.dhuroje_conversation_members cm where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id limit 1;
 select c.listing_id into v_listing from public.dhuroje_conversations c where c.id=new.conversation_id;
 if v_recipient is not null then
   insert into public.dhuroje_notifications(recipient_id,type,title,body,listing_id) values(v_recipient,'message','Mesazh i ri',left(new.body,120),v_listing);
 end if;
 return new;
end $$;

drop trigger if exists dhuroje_claim_notification on public.dhuroje_claims;
create trigger dhuroje_claim_notification after insert or update of status on public.dhuroje_claims for each row execute function private.dhuroje_notify_claim();
drop trigger if exists dhuroje_pickup_notification on public.dhuroje_pickups;
create trigger dhuroje_pickup_notification after insert or update of status on public.dhuroje_pickups for each row execute function private.dhuroje_notify_pickup();
drop trigger if exists dhuroje_review_notification on public.dhuroje_reviews;
create trigger dhuroje_review_notification after insert on public.dhuroje_reviews for each row execute function private.dhuroje_notify_review();
drop trigger if exists dhuroje_message_notification on public.dhuroje_messages;
create trigger dhuroje_message_notification after insert on public.dhuroje_messages for each row execute function private.dhuroje_notify_message();

revoke all on function private.dhuroje_notify_claim() from public,anon,authenticated;
revoke all on function private.dhuroje_notify_pickup() from public,anon,authenticated;
revoke all on function private.dhuroje_notify_review() from public,anon,authenticated;
revoke all on function private.dhuroje_notify_message() from public,anon,authenticated;
