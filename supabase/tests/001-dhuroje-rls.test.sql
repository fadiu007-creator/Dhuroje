begin;
select plan(9);

select tests.create_supabase_user('dhuroje-owner@test.local');
select tests.create_supabase_user('dhuroje-requester@test.local');
select tests.create_supabase_user('dhuroje-outsider@test.local');

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='dhuroje_claims'),
  'RLS is enabled on dhuroje_claims'
);

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='dhuroje_conversations'),
  'RLS is enabled on dhuroje_conversations'
);

insert into public.dhuroje_listings
  (owner_id,title,description,category,status)
values
  (tests.get_supabase_uid('dhuroje-owner@test.local'),
   'RLS test donation','test','other','available');

select tests.authenticate_as('dhuroje-requester@test.local');

select lives_ok(
  $$insert into public.dhuroje_claims
    (listing_id,claimant_id,status)
    select id, tests.get_supabase_uid('dhuroje-requester@test.local'),'pending'
    from public.dhuroje_listings
    where title='RLS test donation'$$,
  'Signed-in requester can claim an available donation'
);

select throws_ok(
  $$insert into public.dhuroje_claims
    (listing_id,claimant_id,status)
    select id, tests.get_supabase_uid('dhuroje-owner@test.local'),'pending'
    from public.dhuroje_listings
    where title='RLS test donation'$$,
  '42501',
  null,
  'Requester cannot create a claim for another user'
);

select lives_ok(
  $$insert into public.dhuroje_conversations (listing_id)
    select id from public.dhuroje_listings where title='RLS test donation'$$,
  'A requester with a claim can create a conversation'
);

insert into public.dhuroje_conversation_members(conversation_id,user_id)
select c.id, tests.get_supabase_uid('dhuroje-requester@test.local')
from public.dhuroje_conversations c
join public.dhuroje_listings l on l.id=c.listing_id
where l.title='RLS test donation';

select tests.authenticate_as('dhuroje-outsider@test.local');

select is(
  (select count(*) from public.dhuroje_conversations c
   join public.dhuroje_listings l on l.id=c.listing_id
   where l.title='RLS test donation'),
  0::bigint,
  'An unrelated user cannot see the conversation'
);

select tests.authenticate_as('dhuroje-owner@test.local');

select is(
  (select count(*) from public.dhuroje_claims cl
   join public.dhuroje_listings l on l.id=cl.listing_id
   where l.title='RLS test donation'),
  1::bigint,
  'The donor can see the request on their donation'
);

select * from finish();
rollback;
