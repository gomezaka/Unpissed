-- Unpissed v0.4 seed data.
-- Run after schema.sql. The app can then load bathrooms from Supabase.

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

insert into public.bathrooms (
  name, type, access_mode, access_note, city, country, is_open_now,
  facilities, vibe_tags, crowd_level, status,
  distance_minutes_demo, distance_miles_demo, map_x, map_y, moderation_status
) values
  (
    'The Fox & Barrel', 'Bar', 'no-code', 'Public-ish · No code · Great lighting', 'Downtown', 'Demo', true,
    array['Gender-neutral','Mirror','Hooks','Soap','Good lighting'],
    array['Selfie light','Dry floor','Calm lock energy'],
    'Low queue · 2 stalls available', 'TRENDING',
    2, 0.10, 63, 35, 'approved'
  ),
  (
    'Neon Noodle Club', 'Restaurant', 'code-needed', 'Code needed · Mirror wall · Fast queue', 'Downtown', 'Demo', true,
    array['Mirror','Dryer','Soap'],
    array['Neon mirror','Receipt code','Quick stop'],
    'Moderate queue · code needed', 'OPEN',
    5, 0.30, 28, 44, 'approved'
  ),
  (
    'Metro Arcade Hall', 'Venue', 'public', 'Public · Loud music · Risky paper', 'Downtown', 'Demo', true,
    array['Public access','Dryer','Loud enough'],
    array['Loud cover','Arcade chaos','Backup plan'],
    'Busy · expect a wait', 'BUSY',
    7, 0.40, 75, 71, 'approved'
  ),
  (
    'Civic Square Restroom', 'Public', 'public', 'Public · Accessible · Closes late', 'Downtown', 'Demo', true,
    array['Accessible','Changing table','Soap','Public access'],
    array['Accessible','Clean public option','Late close'],
    'Steady · usually fine', 'OPEN',
    4, 0.20, 41, 67, 'approved'
  ),
  (
    'Velvet Basement', 'Club', 'customer-only', 'Customer-only · Dark vibe · No queue', 'Downtown', 'Demo', true,
    array['Mirror','Hooks','Loud enough'],
    array['Dark vibe','No queue','Club basement'],
    'No queue · bring confidence', 'OPEN',
    9, 0.60, 18, 74, 'approved'
  )
on conflict do nothing;
