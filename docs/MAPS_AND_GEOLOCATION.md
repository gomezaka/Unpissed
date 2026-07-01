# Maps and geolocation

Unpissed v0.6 uses Leaflet for the interactive map.

## Default map provider

The default tile layer is:

```text
https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

Configured in:

```text
js/config.js
```

## Why this setup

- No API key required for first MVP testing
- Good mobile support
- Easy to swap provider later
- Keeps the app static/Netlify-friendly

## Production warning

OpenStreetMap data is open, but the public OSM tile servers are a shared community resource. For heavier production traffic, use a dedicated provider or your own tile service and update:

```js
MAP_TILE_URL
MAP_TILE_ATTRIBUTION
```

## Coordinates

Bathrooms use:

```text
bathrooms.lat
bathrooms.lng
```

If a bathroom has no coordinates, it can still appear in lists and details, but it will not appear as a pin on the map.

## Geolocation

The app uses the browser Geolocation API. This requires HTTPS in production. Netlify provides HTTPS automatically.

The location flow:

1. User taps **Enable location** or **Emergency Mode**
2. Browser asks for permission
3. App stores the location only in memory
4. Bathrooms are sorted by walking distance estimate
5. Emergency Route draws a line from user location to selected bathroom

The app does not write the user's live location to Supabase.

## Adding bathrooms

When the user adds a bathroom while location is active, the current phone position is saved as the bathroom's `lat` and `lng`.

