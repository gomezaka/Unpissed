-- Unpissed MVP schema draft for Supabase/Postgres.
-- Run in Supabase SQL editor when you are ready to connect the app.

create extension if not exists pgcrypto;
create extension if not exists postgis;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  handle text unique,
  avatar_url text,
  city text,
  anonymous_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bathrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue_name text,
  type text not null default 'other',
  access_mode text not null default 'unknown' check (access_mode in ('public','no-code','code-needed','customer-only','paid','unknown')),
  access_note text,
  location geography(point, 4326),
  address text,
  city text,
  country text,
  is_open_now boolean,
  facilities text[] not null default '{}',
  added_by uuid references public.profiles(id) on delete set null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bathroom_id uuid not null references public.bathrooms(id) on delete cascade,
  anonymous boolean not null default true,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null unique references public.checkins(id) on delete cascade,
  bathroom_id uuid not null references public.bathrooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cleanliness numeric(2,1) not null check (cleanliness between 1 and 5),
  queue_factor numeric(2,1) not null check (queue_factor between 1 and 5),
  paper_quality numeric(2,1) not null check (paper_quality between 1 and 5),
  lock_confidence numeric(2,1) not null check (lock_confidence between 1 and 5),
  vibe numeric(2,1) not null check (vibe between 1 and 5),
  essentials numeric(2,1) not null check (essentials between 1 and 5),
  sound_safety numeric(2,1) not null check (sound_safety between 1 and 5),
  overall numeric(3,2) generated always as (
    (cleanliness + queue_factor + paper_quality + lock_confidence + vibe + essentials + sound_safety) / 7.0
  ) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid references public.bathrooms(id) on delete cascade,
  checkin_id uuid references public.checkins(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  storage_provider text not null default 'cloudflare-r2',
  storage_key text not null,
  public_url text,
  width integer,
  height integer,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','hidden')),
  created_at timestamptz not null default now()
);

create table if not exists public.badges (
  id text primary key,
  title text not null,
  subtitle text,
  description text,
  icon text
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create or replace view public.bathroom_rating_summary as
select
  b.id as bathroom_id,
  b.name,
  count(r.id) as rating_count,
  round(avg(r.overall)::numeric, 2) as overall_rating,
  round(avg(r.cleanliness)::numeric, 2) as cleanliness,
  round(avg(r.queue_factor)::numeric, 2) as queue_factor,
  round(avg(r.paper_quality)::numeric, 2) as paper_quality,
  round(avg(r.lock_confidence)::numeric, 2) as lock_confidence,
  round(avg(r.vibe)::numeric, 2) as vibe,
  round(avg(r.essentials)::numeric, 2) as essentials,
  round(avg(r.sound_safety)::numeric, 2) as sound_safety
from public.bathrooms b
left join public.ratings r on r.bathroom_id = b.id
group by b.id, b.name;

alter table public.profiles enable row level security;
alter table public.bathrooms enable row level security;
alter table public.checkins enable row level security;
alter table public.ratings enable row level security;
alter table public.photos enable row level security;
alter table public.user_badges enable row level security;
alter table public.follows enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);

create policy "approved bathrooms are readable" on public.bathrooms for select using (moderation_status in ('approved','pending'));
create policy "authenticated users can add bathrooms" on public.bathrooms for insert with check (auth.uid() = added_by);

create policy "checkins readable" on public.checkins for select using (true);
create policy "users can create own checkins" on public.checkins for insert with check (auth.uid() = user_id);

create policy "ratings readable" on public.ratings for select using (true);
create policy "users can create own ratings" on public.ratings for insert with check (auth.uid() = user_id);

create policy "approved photos readable" on public.photos for select using (moderation_status in ('approved','pending'));
create policy "users can add own photos" on public.photos for insert with check (auth.uid() = user_id);

create policy "user badges readable" on public.user_badges for select using (true);
create policy "follows readable" on public.follows for select using (true);
create policy "users can manage own follows" on public.follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- v0.3 additions: feed, reviews, reports and privacy-safe social layer.
create table if not exists public.feed_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('checkin','badge','bathroom_added','trending','review')),
  bathroom_id uuid references public.bathrooms(id) on delete cascade,
  checkin_id uuid references public.checkins(id) on delete cascade,
  badge_id text references public.badges(id) on delete set null,
  visibility text not null default 'friends_delayed' check (visibility in ('private','friends_delayed','friends','public')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  bathroom_id uuid references public.bathrooms(id) on delete cascade,
  photo_id uuid references public.photos(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

alter table public.feed_events enable row level security;
alter table public.reports enable row level security;

create policy "feed events readable by app" on public.feed_events for select using (visibility in ('friends_delayed','friends','public'));
create policy "users can create feed events" on public.feed_events for insert with check (auth.uid() = actor_id);

create policy "users can create reports" on public.reports for insert with check (auth.uid() = reporter_id);
