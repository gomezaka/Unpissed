-- Unpissed v0.4 Supabase schema.
-- Run this in Supabase SQL Editor before enabling js/config.js.
-- Uses Supabase Auth + Postgres + Storage.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Unpissed User',
  handle text unique,
  avatar_url text,
  city text,
  anonymous_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Unpissed User')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------- bathrooms ----------
create table if not exists public.bathrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  venue_name text,
  type text not null default 'Other',
  access_mode text not null default 'unknown' check (access_mode in ('public','no-code','code-needed','customer-only','paid','unknown')),
  access_note text,
  address text,
  city text,
  country text,
  lat double precision,
  lng double precision,
  is_open_now boolean not null default true,
  facilities text[] not null default '{}',
  vibe_tags text[] not null default '{}',
  crowd_level text,
  status text not null default 'OPEN',
  distance_minutes_demo integer not null default 4,
  distance_miles_demo numeric(4,2) not null default 0.2,
  map_x numeric(5,2) not null default 50,
  map_y numeric(5,2) not null default 50,
  added_by uuid references public.profiles(id) on delete set null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bathrooms_set_updated_at on public.bathrooms;
create trigger bathrooms_set_updated_at
before update on public.bathrooms
for each row execute function public.set_updated_at();

-- ---------- checkins and ratings ----------
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

-- ---------- photos ----------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  bathroom_id uuid references public.bathrooms(id) on delete cascade,
  checkin_id uuid references public.checkins(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  storage_provider text not null default 'supabase-storage',
  storage_key text not null,
  public_url text,
  width integer,
  height integer,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected','hidden')),
  created_at timestamptz not null default now()
);

-- ---------- badges/social/moderation ----------
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

-- ---------- read model for the static app ----------
create or replace view public.bathroom_rating_summary as
select
  b.id as bathroom_id,
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
group by b.id;

create or replace view public.bathroom_cards
with (security_invoker = true)
as
select
  b.*,
  coalesce(s.rating_count, 0) as rating_count,
  coalesce(s.overall_rating, 4.00) as overall_rating,
  coalesce(s.cleanliness, 4.00) as cleanliness,
  coalesce(s.queue_factor, 4.00) as queue_factor,
  coalesce(s.paper_quality, 4.00) as paper_quality,
  coalesce(s.lock_confidence, 4.00) as lock_confidence,
  coalesce(s.vibe, 4.00) as vibe,
  coalesce(s.essentials, 4.00) as essentials,
  coalesce(s.sound_safety, 4.00) as sound_safety,
  coalesce(p.photo_count, 0) as photo_count
from public.bathrooms b
left join public.bathroom_rating_summary s on s.bathroom_id = b.id
left join (
  select bathroom_id, count(*) as photo_count
  from public.photos
  where moderation_status in ('pending','approved')
  group by bathroom_id
) p on p.bathroom_id = b.id
where b.moderation_status in ('approved','pending');

-- ---------- RLS ----------
-- Drop policies first so this file can be re-run safely during development.
drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "public bathrooms are readable" on public.bathrooms;
drop policy if exists "authenticated users can add bathrooms" on public.bathrooms;
drop policy if exists "users can update own pending bathrooms" on public.bathrooms;
drop policy if exists "checkins readable" on public.checkins;
drop policy if exists "users create own checkins" on public.checkins;
drop policy if exists "ratings readable" on public.ratings;
drop policy if exists "users create own ratings" on public.ratings;
drop policy if exists "photos readable" on public.photos;
drop policy if exists "users add own photos" on public.photos;
drop policy if exists "badges readable" on public.badges;
drop policy if exists "user badges readable" on public.user_badges;
drop policy if exists "users can unlock own badges" on public.user_badges;
drop policy if exists "follows readable" on public.follows;
drop policy if exists "users manage own follows" on public.follows;
drop policy if exists "feed events readable" on public.feed_events;
drop policy if exists "users create feed events" on public.feed_events;
drop policy if exists "users create reports" on public.reports;

alter table public.profiles enable row level security;
alter table public.bathrooms enable row level security;
alter table public.checkins enable row level security;
alter table public.ratings enable row level security;
alter table public.photos enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.follows enable row level security;
alter table public.feed_events enable row level security;
alter table public.reports enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

create policy "public bathrooms are readable" on public.bathrooms for select using (moderation_status in ('approved','pending'));
create policy "authenticated users can add bathrooms" on public.bathrooms for insert with check (auth.uid() = added_by);
create policy "users can update own pending bathrooms" on public.bathrooms for update using (auth.uid() = added_by and moderation_status = 'pending');

create policy "checkins readable" on public.checkins for select using (true);
create policy "users create own checkins" on public.checkins for insert with check (auth.uid() = user_id);

create policy "ratings readable" on public.ratings for select using (true);
create policy "users create own ratings" on public.ratings for insert with check (auth.uid() = user_id);

create policy "photos readable" on public.photos for select using (moderation_status in ('approved','pending'));
create policy "users add own photos" on public.photos for insert with check (auth.uid() = user_id);

create policy "badges readable" on public.badges for select using (true);
create policy "user badges readable" on public.user_badges for select using (true);
create policy "users can unlock own badges" on public.user_badges for insert with check (auth.uid() = user_id);

create policy "follows readable" on public.follows for select using (true);
create policy "users manage own follows" on public.follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

create policy "feed events readable" on public.feed_events for select using (visibility in ('friends_delayed','friends','public'));
create policy "users create feed events" on public.feed_events for insert with check (auth.uid() = actor_id);

create policy "users create reports" on public.reports for insert with check (auth.uid() = reporter_id or reporter_id is null);

-- ---------- Storage bucket and policies ----------
drop policy if exists "bathroom photos are public readable" on storage.objects;
drop policy if exists "authenticated users upload bathroom photos" on storage.objects;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bathroom-photos',
  'bathroom-photos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "bathroom photos are public readable"
on storage.objects for select
using (bucket_id = 'bathroom-photos');

create policy "authenticated users upload bathroom photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'bathroom-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
