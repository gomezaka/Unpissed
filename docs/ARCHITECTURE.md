# Unpissed architecture v0.6.1

```text
GitHub
  |
Netlify
  |
Static PWA frontend
  |
Supabase
  - Auth
  - Postgres
  - Storage
```

## Data source

Supabase is the only data source.

Removed from v0.5:

- localStorage demo adapter
- fake bathroom fallback
- fake feed/reviews/friends
- static `js/data.js`

Retained Netlify function:

- `/.netlify/functions/health` for deployment health checks only

## Frontend files

- `index.html`
- `css/styles.css`
- `js/config.js`
- `js/supabase-api.js`
- `js/app.js`

## Main Supabase tables

- `profiles`
- `bathrooms`
- `checkins`
- `ratings`
- `photos`
- `badges`
- `user_badges`
- `follows`
- `feed_events`
- `reports`

## Flow

```text
Open app
  -> Load Supabase session
  -> Load approved and unused bathrooms, visible feed events, badges and friend graph
  -> Signed-in users can add bathrooms, follow people, check in, upload photos and report privacy issues
  -> Check-ins use the create_checkin_with_rating RPC so checkin/rating/feed writes commit together
```
