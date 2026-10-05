-- Allow logged-out users to browse open community requests.
create policy "requests_select_public"
on public.dhuroje_requests
for select
to anon
using (status = 'open');
