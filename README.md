# Unpissed v0.1

Static mobile-first PWA prototype for **Unpissed**.

The app is built from the provided mobile design direction and is ready to deploy on Netlify as a static site.

## What is included

- Mobile-first home screen based on the supplied design
- Dark nightlife UI
- Interactive bathroom map with selectable pins
- Emergency Mode modal
- Bathroom profile card
- Check-in and rating flow
- Badge page
- Social feed
- Profile/stats page
- Add bathroom modal
- LocalStorage demo persistence
- PWA manifest and service worker
- Netlify config

## What is not included yet

- Real database
- Real authentication
- Real geolocation/map provider
- Cloudflare R2/Images upload
- Supabase integration
- Real friend/follow system

## Local testing

Open `index.html` directly in a browser, or run a simple local server:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Netlify deployment

1. Create a GitHub repository.
2. Add all files in this folder to the repository.
3. Connect the repository to Netlify.
4. Build command can be empty.
5. Publish directory should be `.`.

The included `netlify.toml` already sets this up.

## Suggested next development step

Replace the demo data/localStorage layer with:

- Supabase Auth
- Supabase Postgres tables for users, bathrooms, checkins, ratings, badges and feed events
- Cloudflare R2/Images for bathroom photos
- Netlify Functions for secure upload permissions
