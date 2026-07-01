# Unpissed v0.4

Static mobile-first PWA prototype for **Unpissed** with optional Supabase backend.

The app still works as a local demo, but v0.4 is the first version that can connect to a real Supabase project for Auth, database and image storage.

## Included

- Mobile-first dark nightlife UI
- Interactive bathroom map with selectable pins
- Emergency Mode
- Search and filters
- Bathroom profile cards
- Check-in and rating flow
- Optional check-in photo field
- Badges and badge progress
- Feed and friend radar preview
- Profile/stat page
- Add bathroom flow
- LocalStorage demo fallback
- Supabase client adapter
- Supabase Auth modal
- Supabase database read/write support
- Supabase Storage upload support
- Supabase SQL schema and seed files
- PWA manifest and service worker
- Netlify config

## New in v0.4

- `js/config.js` runtime config
- `js/supabase-api.js` backend adapter
- Login/signup modal
- Supabase status strip: demo / ready / live / error
- Bathroom reads from Supabase when configured
- Check-ins and ratings can be written to Supabase
- Bathroom submissions can be written to Supabase
- Photo upload path moved from Cloudflare R2 placeholder to Supabase Storage for the first MVP
- `supabase/schema.sql` updated with RLS, auth profile trigger and storage policies
- `supabase/seed.sql` now includes demo bathroom rows
- `docs/SUPABASE_SETUP.md`

## Still not included

- Real geolocation/map provider
- Production moderation dashboard
- Server-side badge engine
- Full friends/follows UI
- Real realtime feed
- Cloudflare image optimization/CDN layer

## Local testing

Open the whole folder in VS Code, then run:

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

You can also run:

```bash
npm install
npm run dev
```

## Local check

```bash
npm run check
```

## Supabase setup

See:

```text
docs/SUPABASE_SETUP.md
```

Quick version:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in SQL Editor.
3. Run `supabase/seed.sql` in SQL Editor.
4. Edit `js/config.js`.
5. Set `ENABLE_SUPABASE: true`.
6. Paste Supabase Project URL and anon public key.
7. Start the app locally.
8. Create a test user from the app.

## Netlify deployment

1. Create a GitHub repository.
2. Add all files in this folder to the repository.
3. Connect the repository to Netlify.
4. Build command can be empty.
5. Publish directory should be `.`.

The included `netlify.toml` sets the publish directory and functions directory.

## Recommended next step

v0.5 should focus on making Supabase the primary source of truth:

- remote check-in history
- remote profile stats
- remote feed events
- actual bathroom detail reviews from database
- server-side badge unlocks
