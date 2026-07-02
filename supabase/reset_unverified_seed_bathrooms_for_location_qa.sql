-- Reset imported/unverified venue-toilet data for location QA.
-- Run in Supabase SQL Editor.
--
-- What this does:
-- 1. Copies imported seed candidates into public.location_qa_candidates.
-- 2. Deletes those candidates from public.bathrooms so bad coordinates stop polluting the app.
-- 3. Leaves approved bathrooms and user-added bathrooms alone.
--
-- Intended target: rows created by SQL seed files, not real user registrations.

begin;

create table if not exists public.location_qa_candidates (
  source_bathroom_id uuid primary key,
  name text not null,
  venue_name text,
  type text,
  access_mode text,
  access_note text,
  address text,
  city text,
  country text,
  old_lat double precision,
  old_lng double precision,
  facilities text[] not null default '{}',
  vibe_tags text[] not null default '{}',
  crowd_level text,
  status text,
  moderation_status text,
  map_x numeric(5,2),
  map_y numeric(5,2),
  qa_status text not null default 'needs_geocoding'
    check (qa_status in ('needs_geocoding','suggested','accepted','rejected','inserted')),
  qa_lat double precision,
  qa_lng double precision,
  qa_address text,
  qa_source text,
  qa_note text,
  copied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists location_qa_candidates_city_idx
  on public.location_qa_candidates (country, city);

create index if not exists location_qa_candidates_status_idx
  on public.location_qa_candidates (qa_status);

with seed_rows as (
  select b.*
  from public.bathrooms b
  where b.moderation_status in ('unused', 'pending')
    and b.added_by is null
    and (
      'unverified' = any(coalesce(b.facilities, ARRAY[]::text[]))
      or 'unverified' = any(coalesce(b.vibe_tags, ARRAY[]::text[]))
      or 'venue_seed' = any(coalesce(b.facilities, ARRAY[]::text[]))
      or 'venue_seed' = any(coalesce(b.vibe_tags, ARRAY[]::text[]))
      or b.crowd_level ilike 'Unverified'
      or b.access_note ilike 'Unverified seed throne:%'
    )
)
insert into public.location_qa_candidates (
  source_bathroom_id,
  name,
  venue_name,
  type,
  access_mode,
  access_note,
  address,
  city,
  country,
  old_lat,
  old_lng,
  facilities,
  vibe_tags,
  crowd_level,
  status,
  moderation_status,
  map_x,
  map_y,
  qa_status,
  copied_at,
  updated_at
)
select
  id,
  name,
  venue_name,
  type,
  access_mode,
  access_note,
  address,
  city,
  country,
  lat,
  lng,
  facilities,
  vibe_tags,
  crowd_level,
  status,
  moderation_status,
  map_x,
  map_y,
  'needs_geocoding',
  now(),
  now()
from seed_rows
on conflict (source_bathroom_id) do update set
  name = excluded.name,
  venue_name = excluded.venue_name,
  type = excluded.type,
  access_mode = excluded.access_mode,
  access_note = excluded.access_note,
  address = excluded.address,
  city = excluded.city,
  country = excluded.country,
  old_lat = excluded.old_lat,
  old_lng = excluded.old_lng,
  facilities = excluded.facilities,
  vibe_tags = excluded.vibe_tags,
  crowd_level = excluded.crowd_level,
  status = excluded.status,
  moderation_status = excluded.moderation_status,
  map_x = excluded.map_x,
  map_y = excluded.map_y,
  qa_status = case
    when public.location_qa_candidates.qa_status = 'inserted' then public.location_qa_candidates.qa_status
    else excluded.qa_status
  end,
  updated_at = now();

delete from public.bathrooms b
using public.location_qa_candidates q
where b.id = q.source_bathroom_id
  and b.moderation_status in ('unused', 'pending')
  and b.added_by is null;

grant usage on schema public to anon, authenticated;
grant select on public.location_qa_candidates to anon, authenticated;

-- Make the new table visible to Supabase REST/PostgREST immediately.
notify pgrst, 'reload schema';

commit;

select
  qa_status,
  country,
  city,
  count(*) as rows,
  count(*) filter (where old_lat is not null and old_lng is not null) as rows_with_old_coordinates,
  count(*) filter (where old_lat is null or old_lng is null) as rows_without_old_coordinates
from public.location_qa_candidates
group by qa_status, country, city
order by country, city, qa_status;

select
  'remaining_seed_rows_in_bathrooms' as check_name,
  count(*) as rows
from public.bathrooms b
where b.moderation_status in ('unused', 'pending')
  and b.added_by is null
  and (
    'unverified' = any(coalesce(b.facilities, ARRAY[]::text[]))
    or 'unverified' = any(coalesce(b.vibe_tags, ARRAY[]::text[]))
    or 'venue_seed' = any(coalesce(b.facilities, ARRAY[]::text[]))
    or 'venue_seed' = any(coalesce(b.vibe_tags, ARRAY[]::text[]))
    or b.crowd_level ilike 'Unverified'
    or b.access_note ilike 'Unverified seed throne:%'
  );
