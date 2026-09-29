-- Public users need image metadata for public listings; storage objects are already public-read.
drop policy if exists "dhuroje users view own listing images" on public.dhuroje_listing_images;

create policy "dhuroje public view listing images"
on public.dhuroje_listing_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.dhuroje_listings l
    where l.id = dhuroje_listing_images.listing_id
      and l.status in ('available','reserved')
  )
);
