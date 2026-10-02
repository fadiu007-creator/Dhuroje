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
create policy "dhuroje users view own notifications" on public.dhuroje_notifications for select to authenticated using ((select auth.uid())=recipient_id);
create policy "dhuroje users mark own notifications read" on public.dhuroje_notifications for update to authenticated using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);
create index if not exists dhuroje_notifications_recipient_idx on public.dhuroje_notifications(recipient_id,created_at desc);

alter table public.dhuroje_reviews enable row level security;
create unique index if not exists dhuroje_reviews_one_per_listing_pair on public.dhuroje_reviews(reviewer_id,reviewed_id,listing_id);
create policy "dhuroje public view reviews" on public.dhuroje_reviews for select to anon,authenticated using (true);
create policy "dhuroje participants create completed reviews" on public.dhuroje_reviews for insert to authenticated
with check ((select auth.uid())=reviewer_id and exists (
 select 1 from public.dhuroje_pickups p where p.listing_id=dhuroje_reviews.listing_id and p.status='completed'
 and ((p.owner_id=(select auth.uid()) and p.claimant_id=reviewed_id) or (p.claimant_id=(select auth.uid()) and p.owner_id=reviewed_id))
));

-- Notification trigger functions live in the private schema and are only invoked by their table triggers.
create schema if not exists private;
