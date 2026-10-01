-- Public poster display information for marketplace-style listings.
drop policy if exists "dhuroje public view poster profiles" on public.dhuroje_profiles;

create policy "dhuroje public view poster profiles"
on public.dhuroje_profiles
for select
to anon, authenticated
using (true);
