-- Mark imported, untested throne candidates as visible-but-unused.
-- Run after older Fredrikstad/Sarpsborg unverified seed files if they inserted moderation_status='pending'.

update public.bathrooms
set
  moderation_status = 'unused',
  status = case when status = 'NEW' then 'UNUSED' else status end,
  updated_at = now()
where moderation_status = 'pending'
  and (
    'unverified' = any(facilities)
    or 'unverified' = any(vibe_tags)
    or crowd_level = 'Unverified'
    or access_note ilike 'Unverified seed throne:%'
  );
