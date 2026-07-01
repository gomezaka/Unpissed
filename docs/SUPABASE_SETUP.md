# Supabase setup for Unpissed v0.5

Unpissed v0.5 is Supabase-only. There is no local demo fallback.

## 1. Create or open the Supabase project

Use your paid Supabase project for Unpissed.

## 2. Run schema

Open SQL Editor and run:

```text
supabase/schema.sql
```

This creates:

- profiles
- bathrooms
- checkins
- ratings
- photos
- badges
- user_badges
- follows
- feed_events
- reports
- storage bucket policies
- bathroom_cards view

## 3. Add badge catalog

Run:

```text
supabase/seed.sql
```

This only adds the app's badge definitions. It does not add fake bathrooms.

## 4. Remove old demo bathrooms if needed

If you previously ran the v0.4 seed with fake bathrooms, run:

```text
supabase/cleanup_demo_data.sql
```

This removes the old demo rows:

- The Fox & Barrel
- Neon Noodle Club
- Metro Arcade Hall
- Civic Square Restroom
- Velvet Basement

## 5. Configure frontend

Edit `js/config.js`:

```js
window.UNPISSED_CONFIG = {
  ENABLE_SUPABASE: true,
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_OR_PUBLISHABLE_KEY',
  SUPABASE_STORAGE_BUCKET: 'bathroom-photos'
};
```

## 6. Auth

Enable email/password auth in Supabase Authentication.

## 7. Storage

The schema creates the public bucket:

```text
bathroom-photos
```

Allowed upload types:

- image/jpeg
- image/png
- image/webp

Max size:

```text
5 MB
```
