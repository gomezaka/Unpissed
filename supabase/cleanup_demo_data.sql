-- Optional cleanup for projects that previously ran the v0.4 demo seed.
-- This removes only the old fake bathroom rows by exact name/country.

delete from public.bathrooms
where country = 'Demo'
   or name in (
    'The Fox & Barrel',
    'Neon Noodle Club',
    'Metro Arcade Hall',
    'Civic Square Restroom',
    'Velvet Basement'
  );
