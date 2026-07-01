# Unpissed v0.2

Static mobile-first PWA prototype for **Unpissed**.

The app is built from the provided mobile design direction and is ready to run locally or deploy on Netlify as a static site.

## What is included

- Mobile-first dark nightlife UI
- Interactive bathroom map with selectable pins
- Emergency Mode modal
- Bathroom filters: 4.5+, no code, open now, accessible
- Bathroom profile card with rating breakdown
- Photo placeholders and optional demo photo filename on check-in
- Check-in and rating flow
- Badge page
- Social feed
- Profile/stats page with recent check-ins
- Add bathroom modal with facilities field
- LocalStorage demo persistence
- PWA manifest and service worker
- Netlify config
- Netlify Functions scaffold
- Supabase SQL schema draft
- Cloudflare R2 upload placeholder function

## What is not included yet

- Real Supabase connection
- Real authentication
- Real geolocation/map provider
- Real Cloudflare R2/Images upload
- Real friend/follow system
- Image moderation

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

## Netlify deployment

1. Create a GitHub repository.
2. Add all files in this folder to the repository.
3. Connect the repository to Netlify.
4. Build command can be empty.
5. Publish directory should be `.`.

The included `netlify.toml` sets the publish directory and functions directory.

## Backend preparation

### Supabase

A first database draft is included here:

```text
supabase/schema.sql
```

It includes tables for:

- profiles
- bathrooms
- checkins
- ratings
- photos
- badges
- user_badges
- follows

### Cloudflare R2

A placeholder function is included here:

```text
netlify/functions/r2-upload-url.js
```

It does not generate real signed URLs yet. It defines the intended API shape and required environment variables.

Required future environment variables:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_R2_BUCKET
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
```

## Suggested next development step

Next version should connect the app to Supabase Auth and replace localStorage demo check-ins with real database writes.
