-- Diagnose bathroom visibility in the app.
-- Run in Supabase SQL Editor after schema.sql, seed.sql, city seed files,
-- and fix_visible_unused_bathrooms.sql.
--
-- The frontend currently points at project ref: qvccjnqxhwgvzkbnhbdr

select current_database() as database_name, current_schema() as schema_name, now() as checked_at;

select
  c.relname as view_name,
  c.reloptions,
  coalesce(c.reloptions @> ARRAY['security_invoker=true']::text[], false) as has_security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('bathroom_rating_summary', 'bathroom_cards')
order by c.relname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('bathrooms', 'ratings', 'photos', 'bathroom_rating_summary', 'bathroom_cards')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

select 'bathrooms_total' as check_name, count(*) as rows
from public.bathrooms;

select 'bathroom_cards_total' as check_name, count(*) as rows
from public.bathroom_cards
;

select
  'frontend_pages_needed_at_1000_rows' as check_name,
  ceil(count(*) / 1000.0)::integer as rows
from public.bathroom_cards;

select
  city,
  country,
  moderation_status,
  status,
  count(*) as rows,
  count(*) filter (where lat is not null and lng is not null) as mapped_rows,
  count(*) filter (where lat is null or lng is null) as missing_coordinates
from public.bathrooms
where country = 'Norway'
group by city, country, moderation_status, status
order by rows desc, city, moderation_status, status;

with target_cities(city) as (
  values
    ('Fredrikstad'),
    ('Sarpsborg'),
    ('Moss'),
    ('Askim'),
    ('Spydeberg')
),
bathroom_counts as (
  select
    city,
    count(*) as bathrooms_rows,
    count(*) filter (where lat is not null and lng is not null) as bathrooms_mapped_rows,
    count(*) filter (where lat is null or lng is null) as bathrooms_missing_coordinates
  from public.bathrooms
  where country = 'Norway'
  group by city
),
card_counts as (
  select
    city,
    count(*) as bathroom_cards_rows,
    count(*) filter (where lat is not null and lng is not null) as bathroom_cards_mapped_rows,
    count(*) filter (where lat is null or lng is null) as bathroom_cards_missing_coordinates
  from public.bathroom_cards
  where country = 'Norway'
  group by city
)
select
  t.city,
  coalesce(b.bathrooms_rows, 0) as bathrooms_rows,
  coalesce(c.bathroom_cards_rows, 0) as bathroom_cards_rows,
  coalesce(b.bathrooms_mapped_rows, 0) as bathrooms_mapped_rows,
  coalesce(c.bathroom_cards_mapped_rows, 0) as bathroom_cards_mapped_rows,
  coalesce(b.bathrooms_missing_coordinates, 0) as bathrooms_missing_coordinates,
  coalesce(c.bathroom_cards_missing_coordinates, 0) as bathroom_cards_missing_coordinates
from target_cities t
left join bathroom_counts b on b.city = t.city
left join card_counts c on c.city = t.city
order by t.city;

select
  id,
  name,
  city,
  country,
  moderation_status,
  status,
  lat,
  lng,
  case when lat is null or lng is null then 'missing_coordinates' else 'mapped' end as map_state,
  created_at
from public.bathroom_cards
where country = 'Norway'
  and city in ('Fredrikstad', 'Sarpsborg', 'Moss', 'Askim', 'Spydeberg')
order by city, created_at desc
limit 100;
