# Supabase setup for Unpissed v0.4

This version can run in two modes:

1. **Demo mode**: no backend, localStorage only.
2. **Supabase mode**: Auth, Postgres and Storage.

## 1. Create Supabase project

Create a Supabase project named `unpissed`.

## 2. Run SQL

Open Supabase → SQL Editor.

Run:

```text
supabase/schema.sql
```

Then run:

```text
supabase/seed.sql
```

The schema creates:

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
- bathroom-photos storage bucket
- row level security policies

## 3. Enable auth

Supabase → Authentication → Providers.

Enable Email login.

For local testing, you may want to disable email confirmation temporarily:

```text
Authentication → Sign In / Providers → Email → Confirm email = off
```

Turn it back on before public testing.

## 4. Configure the app

Open:

```text
js/config.js
```

Set:

```js
window.UNPISSED_CONFIG = {
  ENABLE_SUPABASE: true,
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-SUPABASE-ANON-KEY',
  SUPABASE_STORAGE_BUCKET: 'bathroom-photos'
};
```

You find these values in:

```text
Supabase → Project Settings → API
```

Use the `anon public` key only. Never use `service_role` in frontend code.

## 5. Test locally

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

The app should show either:

- `Demo mode` if Supabase is disabled
- `Supabase ready` if Supabase is configured
- `Supabase live` after sign-in

## 6. What works in v0.4

With Supabase enabled and a signed-in user:

- create account
- sign in
- sign out
- load bathrooms from Supabase
- add bathroom to Supabase
- create check-in
- create rating
- upload optional check-in photo to Supabase Storage
- create report/privacy ticket
- create basic feed event

The app still keeps local badge progress as a frontend demo until badge logic is moved server-side.
