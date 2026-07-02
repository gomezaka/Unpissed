-- Post-seed repair for imported, unverified throne candidates.
-- Safe to re-run after schema.sql and after any city seed file.
--
-- What this does:
-- 1. Allows moderation_status='unused'.
-- 2. Recreates the public read views with security_invoker=true.
-- 3. Grants anon/authenticated read access needed by security_invoker views.
-- 4. Converts imported unverified venue seeds from pending/NEW to unused/UNUSED,
--    so they are visible in the app as unverified candidates.
--
-- Important: "Nearby" in the app must come from real device location only.
-- This SQL does not create location fallback behavior.

begin;

alter table public.bathrooms
  alter column moderation_status set default 'unused';

alter table public.bathrooms
  drop constraint if exists bathrooms_moderation_status_check;

alter table public.bathrooms
  add constraint bathrooms_moderation_status_check
  check (moderation_status in ('unused','pending','approved','rejected','hidden'));

create index if not exists bathrooms_country_city_idx
  on public.bathrooms (country, city);

create index if not exists bathrooms_moderation_status_idx
  on public.bathrooms (moderation_status);

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

update public.bathrooms
set
  moderation_status = 'unused',
  status = case
    when status is null or upper(status) in ('NEW', 'OPEN', 'PENDING') then 'UNUSED'
    else status
  end,
  updated_at = now()
where moderation_status in ('pending', 'unused')
  and (
    'unverified' = any(coalesce(facilities, ARRAY[]::text[]))
    or 'unverified' = any(coalesce(vibe_tags, ARRAY[]::text[]))
    or 'venue_seed' = any(coalesce(facilities, ARRAY[]::text[]))
    or 'venue_seed' = any(coalesce(vibe_tags, ARRAY[]::text[]))
    or crowd_level ilike 'Unverified'
    or access_note ilike 'Unverified seed throne:%'
  );

commit;

select 'bathroom_cards_total' as check_name, count(*) as rows
from public.bathroom_cards;

select 'visible_seed_candidates_total' as check_name, count(*) as rows
from public.bathroom_cards
where moderation_status = 'unused'
  and (
    'unverified' = any(coalesce(facilities, ARRAY[]::text[]))
    or 'unverified' = any(coalesce(vibe_tags, ARRAY[]::text[]))
    or 'venue_seed' = any(coalesce(facilities, ARRAY[]::text[]))
    or 'venue_seed' = any(coalesce(vibe_tags, ARRAY[]::text[]))
    or crowd_level ilike 'Unverified'
    or access_note ilike 'Unverified seed throne:%'
  );

select
  city,
  country,
  count(*) as visible_rows,
  count(*) filter (where lat is not null and lng is not null) as mapped_rows,
  count(*) filter (where lat is null or lng is null) as missing_coordinates
from public.bathroom_cards
where country = 'Norway'
group by city, country
order by visible_rows desc, city;
