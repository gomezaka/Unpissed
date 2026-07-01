-- Unpissed v0.5 badge catalog.
-- This is app content, not demo bathroom data.
-- Run after schema.sql if you want the default badge set.

insert into public.badges (id, title, subtitle, description, icon) values
  ('emergency-landing', 'Emergency Landing', 'Fast thinking. Faster walking.', 'Check in at the nearest bathroom within 100 meters.', 'pulse'),
  ('golden-flush', 'The Golden Flush', 'You are now a porcelain critic.', 'Rate 10 different bathrooms.', 'medal'),
  ('pub-crawl-plumber', 'Pub Crawl Plumber', 'One night. Five stops. Questionable decisions.', 'Check in at 5 different bathrooms in one night.', 'route'),
  ('porcelain-royalty', 'Porcelain Royalty', 'You sat where legends sit.', 'Visit the highest-rated bathroom in a city.', 'crown'),
  ('hidden-gem-hunter', 'Hidden Gem Hunter', 'You found the throne before it was famous.', 'Be the first to add a bathroom that later becomes highly rated.', 'spark'),
  ('night-watch', 'Night Watch', 'Rated after midnight. Brave work.', 'Check in between midnight and 04:00.', 'moon')
on conflict (id) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description = excluded.description,
  icon = excluded.icon;
