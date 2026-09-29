-- Dhuroje test setup. Run with: supabase test db
-- The test helper extension creates isolated auth users and JWT contexts.
create extension if not exists pgtap with schema extensions;

begin;
select plan(1);
select ok(true, 'Dhuroje pgTAP setup loaded');
select * from finish();
rollback;
