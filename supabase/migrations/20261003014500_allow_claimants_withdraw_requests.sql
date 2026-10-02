drop policy if exists "dhuroje claimants cancel own pending claims" on public.dhuroje_claims;

create policy "dhuroje claimants cancel own pending claims"
on public.dhuroje_claims
for update
to authenticated
using ((select auth.uid()) = claimant_id and status = 'pending')
with check ((select auth.uid()) = claimant_id and status = 'cancelled');
