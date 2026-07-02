-- Unpissed v0.5 badge catalog.
-- This is app content, not demo bathroom data.
-- Run after schema.sql if you want the default badge set.

insert into public.badges (id, title, subtitle, description, icon) values
  ('emergency-landing', 'Emergency Landing', 'Fast thinking. Faster walking.', 'Check in at the nearest bathroom within 100 meters.', 'pulse'),
  ('golden-flush', 'The Golden Flush', 'You are now a porcelain critic.', 'Rate 10 different bathrooms.', 'medal'),
  ('pub-crawl-plumber', 'Pub Crawl Plumber', 'One night. Five stops. Questionable decisions.', 'Check in at 5 different bathrooms in one night.', 'route'),
  ('porcelain-royalty', 'Porcelain Royalty', 'You sat where legends sit.', 'Visit the highest-rated bathroom in a city.', 'crown'),
  ('hidden-gem-hunter', 'Hidden Gem Hunter', 'You found the throne before it was famous.', 'Be the first to add a bathroom that later becomes highly rated.', 'spark'),
  ('night-watch', 'Night Watch', 'Rated after midnight. Brave work.', 'Check in between midnight and 04:00.', 'moon'),
  ('country-norway', 'Norway Relief', 'First check-in in Norway.', 'Check in at a bathroom in Norway.', 'flag-no'),
  ('country-denmark', 'Denmark Relief', 'First check-in in Denmark.', 'Check in at a bathroom in Denmark.', 'flag-dk'),
  ('country-ireland', 'Ireland Relief', 'First check-in in Ireland.', 'Check in at a bathroom in Ireland.', 'flag-ie'),
  ('country-sweden', 'Sweden Relief', 'First check-in in Sweden.', 'Check in at a bathroom in Sweden.', 'flag-se'),
  ('country-finland', 'Finland Relief', 'First check-in in Finland.', 'Check in at a bathroom in Finland.', 'flag-fi'),
  ('forest-first-relief', 'Forest First Relief', 'You logged one in the wild.', 'Check in at an outdoor, forest, trail or nature bathroom.', 'forest'),
  ('forest-trail-regular', 'Trail Regular', 'Three outdoor check-ins. Rugged.', 'Check in at outdoor or forest bathrooms three times.', 'forest'),
  ('forest-legend', 'Forest Legend', 'Ten outdoor check-ins. Mythic logistics.', 'Check in at outdoor or forest bathrooms ten times.', 'forest'),
  ('challenge-first-to-fold', 'First to Fold', 'The body made a persuasive argument.', 'Be the first person to check in during a challenge.', 'flag'),
  ('challenge-last-throne-standing', 'Last Throne Standing', 'Calm under social pressure.', 'Be the final person to check in during a challenge with friends.', 'crown'),
  ('challenge-bladder-royale', 'Bladder Royale', 'You entered the arena. Sensibly.', 'Complete any friend challenge check-in.', 'pulse')
on conflict (id) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description = excluded.description,
  icon = excluded.icon;
