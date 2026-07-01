# Unpissed architecture draft

## Current v0.3 state

The app is still static and runs fully in the browser.

```text
index.html
  css/styles.css
  js/data.js
  js/app.js
  localStorage demo state
```

No backend credentials are required yet.

## Target architecture

```text
GitHub
  -> Netlify deploy
      -> Static PWA frontend
      -> Netlify Functions
          -> Supabase Auth/Postgres
          -> Cloudflare R2 upload permissions

Cloudflare R2
  -> Original uploaded bathroom/check-in photos

Supabase
  -> profiles
  -> bathrooms
  -> checkins
  -> ratings
  -> photos metadata
  -> badges
  -> feed_events
  -> reports
```

## Privacy defaults

Unpissed should not show exact real-time bathroom activity by default.

Recommended defaults:

- anonymous check-in enabled
- feed activity delayed
- exact bathroom location hidden from friends in real time
- photo moderation required before public display
- privacy report button on every bathroom/photo context

## Image policy

Photo upload rule:

> Show the vibe, not the victims. No people, no nudity, no disasters.

Store the original file in Cloudflare R2 and metadata in Supabase `photos`.

## Next backend step

Create a small data adapter that can switch between:

```text
demoLocalStorageAdapter
supabaseAdapter
```

That lets the prototype remain useful while Supabase is introduced screen by screen.
