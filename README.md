# Unpissed v0.6.1

Mobile-first PWA for Unpissed with Supabase-only data, real map rendering and browser geolocation.

## Stack

- Netlify + GitHub for hosting/deploy
- Supabase Auth
- Supabase Postgres
- Supabase Storage bucket: `bathroom-photos`
- Leaflet for the interactive map
- OpenStreetMap raster tiles by default
- Static frontend: `index.html`, `css/styles.css`, `js/app.js`

## What changed in v0.6.1

- Replaced the stylized fake map with a real Leaflet map
- Added OpenStreetMap tile layer with attribution
- Added browser geolocation
- Added location status card on the home screen
- Added distance calculation from the user's phone position
- Added walking-time labels such as `4 min walk · 290 m`
- Emergency Mode now sorts by nearest mapped bathroom
- Emergency Route draws a blue line from the user's location to the selected bathroom
- Recenter button now requests/refreshes real location
- Add Bathroom now saves the user's current latitude/longitude when location is enabled
- Supabase `bathrooms.lat` and `bathrooms.lng` are used as the real map coordinates
- Added a database index for bathroom coordinates

## Local start

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

Geolocation works best on the deployed Netlify HTTPS URL. Localhost normally works for development in modern browsers.

## Local moderator and coordinate repair

The moderator tool is local only. It is a Node server bound to `127.0.0.1`; it is not a public admin route in the user app.

Create `.env.local` in the repo root:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Do not put the service role key in `js/config.js`, and do not use a frontend prefix such as `VITE_` for admin keys.

Start the local moderator:

```bash
npm run moderator
```

Or on Windows:

```bat
start-moderator.cmd
```

Preview coordinate repairs without writing to the database:

```bash
npm run coordinates:dry-run -- --limit 10
npm run coordinates:dry-run -- --query Sarpsborg
```

Or on Windows:

```bat
preview-coordinate-fixes.cmd --limit 10
preview-coordinate-fixes.cmd --query Sarpsborg
```

Apply coordinate repairs only after reviewing the dry-run:

```bash
npm run coordinates:fix
npm run coordinates:fix -- --query Sarpsborg
```

Or on Windows:

```bat
apply-coordinate-fixes.cmd --query Sarpsborg
```

The apply command creates a JSON backup in `coordinate-backups/` before updating Supabase. It only writes when `--apply` is used, and the Windows starter also requires typing `APPLY`.

The `.cmd` starters always run `cd /d "%~dp0"` first, so they execute from the Unpissed repo even if the terminal was opened in the wrong folder.

## Supabase config

Edit `js/config.js`:

```js
window.UNPISSED_CONFIG = {
  ENABLE_SUPABASE: true,
  SUPABASE_URL: 'https://YOUR_PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_ANON_OR_PUBLISHABLE_KEY',
  SUPABASE_STORAGE_BUCKET: 'bathroom-photos',
  MAP_DEFAULT_CENTER: [59.9139, 10.7522],
  MAP_DEFAULT_ZOOM: 14,
  MAP_TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  MAP_TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
};
```

The tile URL is configurable so you can switch from OpenStreetMap's public tile server to another provider later if traffic grows.

## Supabase setup

Run in Supabase SQL Editor:

1. `supabase/schema.sql`
2. `supabase/challenges.sql` if you are updating an existing database instead of rebuilding from `schema.sql`
3. `supabase/seed.sql` for default badges and challenge badges
4. Any city seed files you want to import
5. `supabase/fix_visible_unused_bathrooms.sql`
6. `supabase/debug_bathroom_visibility.sql` to verify the result

The full SQL runbook is in `supabase/RUNBOOK.md`.

Existing bathrooms without coordinates still show in lists, but they will not appear as map pins until `lat` and `lng` are set.

## Friend challenges

Challenges are a signed-in friend feature in the app:

- **Last Throne Standing**: the last participant to check in wins.
- **First to Go**: the first participant to check in gets the early-exit title.

Start and join challenges from **Friends -> Challenges**. A normal bathroom check-in automatically updates any active challenge where you are still standing.

## Testing checklist

On the Netlify mobile URL:

1. Sign in
2. Tap **Enable location**
3. Confirm that the map recenters to your area
4. Add a bathroom while location is enabled
5. Confirm that it appears as a map pin
6. Open **Emergency Mode**
7. Start route to the nearest bathroom
8. Confirm that distance and walking time are shown

## Netlify

Build command can be empty.

Publish directory:

```text
.
```

## Notes

- Do not put Supabase `service_role` keys in frontend files.
- `VITE_` variables are not required because this is still a static app without a build step.
- Photos are uploaded to Supabase Storage and registered in the `photos` table.
- OpenStreetMap data is free, but their public tile servers have usage limits/policies. For heavier production traffic, switch `MAP_TILE_URL` to a dedicated tile provider.

## v0.6.1 fix

- Bottom navigation is fixed to the bottom of the app viewport.
- The page itself no longer scrolls on mobile; only the main content area scrolls.
- Extra bottom padding keeps content from hiding behind the navigation bar.
- Safe-area padding is kept for iOS/Android browser/PWA installs.
