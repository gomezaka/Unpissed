# Unpissed architecture v0.5

```text
GitHub
  ↓
Netlify
  ↓
Static PWA frontend
  ↓
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
- `feed_events`
- `reports`

## Flow

```text
Open app
  → Load Supabase session
  → Load public bathrooms/feed/badges
  → Signed-in users can add bathrooms, check in, upload photos and report privacy issues
```
