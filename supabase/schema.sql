create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Dhuroje user',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null check (category in ('food','clothing','home','electronics','kids','books','other')),
  status text not null default 'available' check (status in ('available','reserved','collected','expired','removed')),
  location_name text,
  latitude double precision,
  longitude double precision,
  available_until timestamptz,
  food_best_before timestamptz,
  food_refrigerated boolean,
  food_opened boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','collected','no_show')),
  created_at timestamptz not null default now(),
  unique(listing_id, claimant_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists listings_status_created_idx on public.listings(status, created_at desc);
create index if not exists listings_category_idx on public.listings(category);
create index if not exists listings_owner_idx on public.listings(owner_id);
create index if not exists claims_listing_idx on public.claims(listing_id);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.claims enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;

create policy "public can view available listings" on public.listings for select to anon, authenticated
  using (status in ('available','reserved'));
create policy "users create own listings" on public.listings for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "owners update own listings" on public.listings for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owners delete own listings" on public.listings for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy "users view own profile" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "users create own profile" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "users update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "claimants view own claims" on public.claims for select to authenticated
  using ((select auth.uid()) = claimant_id);
create policy "claimants create own claims" on public.claims for insert to authenticated
  with check ((select auth.uid()) = claimant_id);
create policy "owners view listing claims" on public.claims for select to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));