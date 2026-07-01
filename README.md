# Unpissed v0.3

Static mobile-first PWA prototype for **Unpissed**.

The app is still frontend-only, but v0.3 is closer to a real MVP structure: it has better discovery, better check-in context, privacy-aware social UI and clearer backend scaffolding for Netlify + Supabase + Cloudflare R2.

## What is included

- Mobile-first dark nightlife UI
- Interactive bathroom map with selectable pins
- Emergency Mode modal
- Active emergency-route banner
- Bathroom search by name, vibe, access, type or facilities
- Bathroom filters: 4.5+, no code, open now, accessible
- Horizontal nearby bathroom rail
- Bathroom profile card with rating breakdown
- Live-ish crowd pulse and vibe tags
- Photo placeholders and optional demo photo filename on check-in
- Photo-safety copy: no people, no nudity, no chaos
- Check-in and rating flow
- Recent reviews in bathroom details
- Access intelligence in bathroom details
- Privacy issue report placeholder
- Badge page with progress bars
- Social feed with friend radar and privacy copy
- Profile/stats page with city bathroom scene card
- Add bathroom modal with facilities field
- LocalStorage demo persistence
- PWA manifest and service worker
- Netlify config
- Netlify Functions scaffold
- Supabase SQL schema draft
- Supabase seed draft
- Cloudflare R2 upload placeholder function
- API contract and R2 planning docs

## What is not included yet

- Real Supabase connection
- Real authentication
- Real geolocation/map provider
- Real Cloudflare R2/Images upload
- Real friend/follow system
- Real moderation queue

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

Database draft:

```text
supabase/schema.sql
```

Seed draft:

```text
supabase/seed.sql
```

Included core tables:

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

### Netlify Functions

Scaffolded functions:

```text
netlify/functions/health.js
netlify/functions/bathrooms.js
netlify/functions/checkins.js
netlify/functions/r2-upload-url.js
netlify/functions/moderate-image.js
```

### Cloudflare R2

Planning doc:

```text
docs/CLOUDFLARE_R2.md
```

Required future environment variables:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_R2_BUCKET
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
```

## Suggested next development step

Next version should add the first real backend adapter:

1. Supabase project setup
2. Auth screen or anonymous demo login
3. Real bathroom reads from Supabase
4. Real check-in writes to Supabase
5. Keep localStorage as fallback/demo mode
