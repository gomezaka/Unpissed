-- Unpissed v0.6 Supabase schema.
-- Production schema: no demo bathroom rows or local fallback.
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
  map_x numeric(5,2) not null default 50,
  map_y numeric(5,2) not null default 50,
  added_by uuid references public.profiles(id) on delete set null,
  moderation_status text not null default 'unused' check (moderation_status in ('unused','pending','approved','rejected','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bathrooms_set_updated_at on public.bathrooms;
create trigger bathrooms_set_updated_at
before update on public.bathrooms
for each row execute function public.set_updated_at();

do $$
begin
  alter table public.bathrooms alter column moderation_status set default 'unused';
  alter table public.bathrooms drop constraint if exists bathrooms_moderation_status_check;
  alter table public.bathrooms add constraint bathrooms_moderation_status_check
    check (moderation_status in ('unused','pending','approved','rejected','hidden'));
end;
$$;

create index if not exists bathrooms_lat_lng_idx on public.bathrooms (lat, lng);
create index if not exists bathrooms_country_city_idx on public.bathrooms (country, city);
create index if not exists bathrooms_moderation_status_idx on public.bathrooms (moderation_status);

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

-- ---------- friend challenges ----------
create table if not exists public.challenge_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Last Throne Standing',
  mode text not null default 'last_throne_standing' check (mode in ('last_throne_standing','first_to_go')),
  status text not null default 'active' check (status in ('active','finished','cancelled')),
  visibility text not null default 'friends' check (visibility in ('private','friends')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists challenge_sessions_set_updated_at on public.challenge_sessions;
create trigger challenge_sessions_set_updated_at
before update on public.challenge_sessions
for each row execute function public.set_updated_at();

create table if not exists public.challenge_participants (
  session_id uuid not null references public.challenge_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'standing' check (status in ('standing','gone','left')),
  joined_at timestamptz not null default now(),
  first_gone_at timestamptz,
  first_checkin_id uuid references public.checkins(id) on delete set null,
  first_bathroom_id uuid references public.bathrooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

drop trigger if exists challenge_participants_set_updated_at on public.challenge_participants;
create trigger challenge_participants_set_updated_at
before update on public.challenge_participants
for each row execute function public.set_updated_at();

create table if not exists public.challenge_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.challenge_sessions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('joined','left','checkin','finished')),
  checkin_id uuid references public.checkins(id) on delete set null,
  bathroom_id uuid references public.bathrooms(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists challenge_sessions_created_by_idx on public.challenge_sessions (created_by, status, created_at desc);
create index if not exists challenge_participants_user_idx on public.challenge_participants (user_id, status);
create index if not exists challenge_participants_session_idx on public.challenge_participants (session_id, first_gone_at);
create index if not exists challenge_events_session_idx on public.challenge_events (session_id, created_at desc);

-- ---------- data guardrails ----------
-- NOT VALID keeps this file safe to run against existing data while enforcing limits on new writes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_text_limits') then
    alter table public.profiles add constraint profiles_text_limits check (
      char_length(display_name) between 1 and 80
      and (handle is null or char_length(handle) <= 40)
      and (avatar_url is null or char_length(avatar_url) <= 2048)
      and (city is null or char_length(city) <= 80)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bathrooms_text_limits') then
    alter table public.bathrooms add constraint bathrooms_text_limits check (
      char_length(name) between 1 and 120
      and (venue_name is null or char_length(venue_name) <= 120)
      and char_length(type) <= 40
      and (access_note is null or char_length(access_note) <= 240)
      and (address is null or char_length(address) <= 240)
      and (city is null or char_length(city) <= 80)
      and (country is null or char_length(country) <= 80)
      and (crowd_level is null or char_length(crowd_level) <= 80)
      and char_length(status) <= 30
      and cardinality(facilities) <= 20
      and cardinality(vibe_tags) <= 20
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'checkins_text_limits') then
    alter table public.checkins add constraint checkins_text_limits check (
      comment is null or char_length(comment) <= 240
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'photos_text_limits') then
    alter table public.photos add constraint photos_text_limits check (
      char_length(storage_provider) <= 80
      and char_length(storage_key) <= 512
      and (public_url is null or char_length(public_url) <= 2048)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'badges_text_limits') then
    alter table public.badges add constraint badges_text_limits check (
      char_length(id) <= 80
      and char_length(title) <= 120
      and (subtitle is null or char_length(subtitle) <= 160)
      and (description is null or char_length(description) <= 500)
      and (icon is null or char_length(icon) <= 80)
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'feed_events_payload_limits') then
    alter table public.feed_events add constraint feed_events_payload_limits check (
      pg_column_size(payload) <= 4096
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reports_text_limits') then
    alter table public.reports add constraint reports_text_limits check (
      char_length(reason) <= 240
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'challenge_sessions_text_limits') then
    alter table public.challenge_sessions add constraint challenge_sessions_text_limits check (
      char_length(title) between 1 and 120
    ) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'challenge_events_payload_limits') then
    alter table public.challenge_events add constraint challenge_events_payload_limits check (
      pg_column_size(payload) <= 4096
    ) not valid;
  end if;
end;
$$;

-- ---------- atomic writes ----------
create or replace function public.create_checkin_with_rating(
  p_bathroom_id uuid,
  p_anonymous boolean,
  p_comment text,
  p_cleanliness numeric,
  p_queue_factor numeric,
  p_paper_quality numeric,
  p_lock_confidence numeric,
  p_vibe numeric,
  p_essentials numeric,
  p_sound_safety numeric
)
returns public.checkins
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_checkin public.checkins;
  v_bathroom_name text;
  v_rating numeric(3,2);
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to check in.';
  end if;

  if p_comment is not null and char_length(p_comment) > 240 then
    raise exception 'Comment is too long.';
  end if;

  select name into v_bathroom_name
  from public.bathrooms
  where id = p_bathroom_id;

  if v_bathroom_name is null then
    raise exception 'Bathroom is not available for check-in.';
  end if;

  v_rating := round((
    p_cleanliness + p_queue_factor + p_paper_quality + p_lock_confidence + p_vibe + p_essentials + p_sound_safety
  ) / 7.0, 2);

  insert into public.checkins (user_id, bathroom_id, anonymous, comment)
  values (auth.uid(), p_bathroom_id, coalesce(p_anonymous, true), coalesce(p_comment, ''))
  returning * into v_checkin;

  insert into public.ratings (
    checkin_id,
    bathroom_id,
    user_id,
    cleanliness,
    queue_factor,
    paper_quality,
    lock_confidence,
    vibe,
    essentials,
    sound_safety
  )
  values (
    v_checkin.id,
    p_bathroom_id,
    auth.uid(),
    p_cleanliness,
    p_queue_factor,
    p_paper_quality,
    p_lock_confidence,
    p_vibe,
    p_essentials,
    p_sound_safety
  );

  insert into public.feed_events (
    actor_id,
    event_type,
    bathroom_id,
    checkin_id,
    visibility,
    payload
  )
  values (
    auth.uid(),
    'checkin',
    p_bathroom_id,
    v_checkin.id,
    case when coalesce(p_anonymous, true) then 'friends_delayed' else 'friends' end,
    jsonb_build_object(
      'bathroomName', coalesce(v_bathroom_name, 'a bathroom'),
      'rating', v_rating
    )
  );

  return v_checkin;
end;
$$;

revoke all on function public.create_checkin_with_rating(uuid, boolean, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.create_checkin_with_rating(uuid, boolean, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- ---------- read model for the static app ----------
create or replace view public.bathroom_rating_summary
with (security_invoker = true)
as
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
  coalesce(s.overall_rating, 0.00) as overall_rating,
  coalesce(s.cleanliness, 0.00) as cleanliness,
  coalesce(s.queue_factor, 0.00) as queue_factor,
  coalesce(s.paper_quality, 0.00) as paper_quality,
  coalesce(s.lock_confidence, 0.00) as lock_confidence,
  coalesce(s.vibe, 0.00) as vibe,
  coalesce(s.essentials, 0.00) as essentials,
  coalesce(s.sound_safety, 0.00) as sound_safety,
  coalesce(p.photo_count, 0) as photo_count
from public.bathrooms b
left join public.bathroom_rating_summary s on s.bathroom_id = b.id
left join (
  select bathroom_id, count(*) as photo_count
  from public.photos
  where moderation_status in ('pending','approved')
  group by bathroom_id
) p on p.bathroom_id = b.id
where b.moderation_status in ('approved','unused');

grant usage on schema public to anon, authenticated;
grant select on public.bathrooms to anon, authenticated;
grant select on public.ratings to anon, authenticated;
grant select on public.photos to anon, authenticated;
grant select on public.bathroom_rating_summary to anon, authenticated;
grant select on public.bathroom_cards to anon, authenticated;
grant select, insert, update, delete on public.challenge_sessions to authenticated;
grant select, insert, update, delete on public.challenge_participants to authenticated;
grant select, insert, update, delete on public.challenge_events to authenticated;

-- ---------- RLS ----------
-- Drop policies first so this file can be re-run safely during development.
drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "users insert own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "public bathrooms are readable" on public.bathrooms;
drop policy if exists "authenticated users can add bathrooms" on public.bathrooms;
drop policy if exists "users can update own pending bathrooms" on public.bathrooms;
drop policy if exists "users can update own unapproved bathrooms" on public.bathrooms;
drop policy if exists "checkins readable" on public.checkins;
drop policy if exists "users create own checkins" on public.checkins;
drop policy if exists "users delete own checkins" on public.checkins;
drop policy if exists "ratings readable" on public.ratings;
drop policy if exists "users create own ratings" on public.ratings;
drop policy if exists "users delete own ratings" on public.ratings;
drop policy if exists "photos readable" on public.photos;
drop policy if exists "users add own photos" on public.photos;
drop policy if exists "users delete own photos" on public.photos;
drop policy if exists "badges readable" on public.badges;
drop policy if exists "user badges readable" on public.user_badges;
drop policy if exists "users can unlock own badges" on public.user_badges;
drop policy if exists "follows readable" on public.follows;
drop policy if exists "users manage own follows" on public.follows;
drop policy if exists "feed events readable" on public.feed_events;
drop policy if exists "users create feed events" on public.feed_events;
drop policy if exists "users delete own feed events" on public.feed_events;
drop policy if exists "users create reports" on public.reports;
drop policy if exists "challenge sessions visible" on public.challenge_sessions;
drop policy if exists "users create own challenges" on public.challenge_sessions;
drop policy if exists "creators update own challenges" on public.challenge_sessions;
drop policy if exists "challenge participants readable" on public.challenge_participants;
drop policy if exists "users join challenges as self" on public.challenge_participants;
drop policy if exists "users update own challenge participant row" on public.challenge_participants;
drop policy if exists "challenge events readable" on public.challenge_events;
drop policy if exists "users create own challenge events" on public.challenge_events;

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
alter table public.challenge_sessions enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_events enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);

create policy "public bathrooms are readable" on public.bathrooms for select using (
  moderation_status in ('approved','unused')
  or auth.uid() = added_by
);
create policy "authenticated users can add bathrooms" on public.bathrooms for insert with check (auth.uid() = added_by);
create policy "users can update own unapproved bathrooms" on public.bathrooms for update using (
  auth.uid() = added_by
  and moderation_status in ('unused','pending')
);

create policy "checkins readable" on public.checkins for select using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.bathrooms b
    where b.id = bathroom_id
      and b.moderation_status in ('approved','unused')
  )
);
create policy "users create own checkins" on public.checkins for insert with check (auth.uid() = user_id);
create policy "users delete own checkins" on public.checkins for delete using (auth.uid() = user_id);

create policy "ratings readable" on public.ratings for select using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.bathrooms b
    where b.id = bathroom_id
      and b.moderation_status in ('approved','unused')
  )
);
create policy "users create own ratings" on public.ratings for insert with check (auth.uid() = user_id);
create policy "users delete own ratings" on public.ratings for delete using (auth.uid() = user_id);

create policy "photos readable" on public.photos for select using (
  moderation_status = 'approved'
  or auth.uid() = user_id
);
create policy "users add own photos" on public.photos for insert with check (auth.uid() = user_id);
create policy "users delete own photos" on public.photos for delete using (auth.uid() = user_id);

create policy "badges readable" on public.badges for select using (true);
create policy "user badges readable" on public.user_badges for select using (true);
create policy "users can unlock own badges" on public.user_badges for insert with check (auth.uid() = user_id);

create policy "follows readable" on public.follows for select using (true);
create policy "users manage own follows" on public.follows for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

create policy "feed events readable" on public.feed_events for select using (
  visibility = 'public'
  or auth.uid() = actor_id
  or (
    auth.uid() is not null
    and actor_id is not null
    and visibility in ('friends_delayed','friends')
    and exists (
      select 1
      from public.follows viewer_to_actor
      where viewer_to_actor.follower_id = auth.uid()
        and viewer_to_actor.following_id = actor_id
    )
    and exists (
      select 1
      from public.follows actor_to_viewer
      where actor_to_viewer.follower_id = actor_id
        and actor_to_viewer.following_id = auth.uid()
    )
  )
);
create policy "users create feed events" on public.feed_events for insert with check (
  auth.uid() = actor_id
  and event_type in ('checkin','bathroom_added','badge','review')
);
create policy "users delete own feed events" on public.feed_events for delete using (auth.uid() = actor_id);

create policy "users create reports" on public.reports for insert with check (auth.uid() = reporter_id or reporter_id is null);

create policy "challenge sessions visible" on public.challenge_sessions for select using (
  auth.uid() = created_by
  or (
    auth.uid() is not null
    and visibility = 'friends'
    and exists (
      select 1
      from public.follows viewer_to_creator
      where viewer_to_creator.follower_id = auth.uid()
        and viewer_to_creator.following_id = created_by
    )
    and exists (
      select 1
      from public.follows creator_to_viewer
      where creator_to_viewer.follower_id = created_by
        and creator_to_viewer.following_id = auth.uid()
    )
  )
  or exists (
    select 1
    from public.challenge_participants p
    where p.session_id = id
      and p.user_id = auth.uid()
      and p.status <> 'left'
  )
);
create policy "users create own challenges" on public.challenge_sessions for insert with check (auth.uid() = created_by);
create policy "creators update own challenges" on public.challenge_sessions for update using (auth.uid() = created_by) with check (auth.uid() = created_by);

create policy "challenge participants readable" on public.challenge_participants for select using (auth.uid() is not null);
create policy "users join challenges as self" on public.challenge_participants for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.challenge_sessions s
    where s.id = session_id
      and s.status = 'active'
  )
);
create policy "users update own challenge participant row" on public.challenge_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "challenge events readable" on public.challenge_events for select using (auth.uid() is not null);
create policy "users create own challenge events" on public.challenge_events for insert with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.challenge_participants p
    where p.session_id = session_id
      and p.user_id = auth.uid()
      and p.status <> 'left'
  )
);

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
