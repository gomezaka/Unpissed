# Unpissed architecture draft

## Current v0.2

The app is still a static mobile-first PWA. It uses `localStorage` for demo state.

## Intended stack

```text
GitHub -> Netlify -> Static PWA
Netlify Functions -> secure server-side helpers
Supabase -> auth + Postgres + RLS
Cloudflare R2 / Images -> bathroom photos
```

## Why this split

- GitHub stores source code, not user content.
- Netlify hosts the app and small API helpers.
- Supabase stores users, bathrooms, ratings, check-ins, follows and badges.
- Cloudflare stores and serves user photos.

## Next backend task

1. Create Supabase project.
2. Run `supabase/schema.sql`.
3. Add Supabase URL and anon key to environment/config.
4. Replace `js/data.js` + `localStorage` with Supabase queries.
5. Implement `netlify/functions/r2-upload-url.js` with real signed R2 uploads.
