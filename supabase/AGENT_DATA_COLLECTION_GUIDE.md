# Data Collection Guide for Unpissed Seed Agents

Goal: produce safe, rerunnable SQL seed files for unverified venue-toilet candidates.

Deliverable:

- One SQL file per batch, named like `seed_moss_askim_spydeberg_v1_unverified_thrones_safe.sql`.
- The file must use a temporary table, insert candidates into it, delete older unverified duplicates for the same `city + venue_name`, and upsert into `public.bathrooms`.
- The file must never delete or overwrite approved/verified bathrooms.

What to collect:

- Restaurants, cafes, pubs, bars, food halls, malls, transport hubs and public venues likely to have guest toilets.
- Prefer venues with public opening hours or clear customer access.
- Exclude private homes, workplaces without public/customer access, closed venues, and places where the venue cannot be identified.

Required fields:

- `id`: stable UUID. Generate deterministically from `country|city|venue_name|address` when possible.
- `name`: `Toalett - <venue name>`.
- `venue_name`: venue name only.
- `type`: one of `Restaurant`, `Cafe`, `Bar`, `Pub`, `Venue`, `Public`, `Other`.
- `address`: full address when verified; otherwise `null`.
- `city`: city/locality.
- `country`: `Norway`.
- `lat`, `lng`: exact venue coordinates only when verified. Use `null, null` if not verified.
- `facilities`: always include `guest_toilet`, `unverified`, `venue_seed`; also include `needs_geocoding` when coordinates are missing.
- `vibe_tags`: include `unverified`, normalized city slug, venue type slug, `seed`, batch slug, and `needs-geocoding` when relevant.
- `map_x`, `map_y`: stable pseudo-random values between 15 and 85 for legacy draft display only. Do not treat them as real coordinates.

Source rules:

- Use current public sources only: official venue pages, official mall/venue listings, OpenStreetMap, reputable map/business listings, or municipality/public transport pages.
- Do not invent addresses or coordinates.
- If sources disagree, keep coordinates `null` and add `needs_geocoding`.
- Keep a private working note of source URLs and search terms. Do not put large source dumps into SQL.

SQL status rules:

- Imported unverified candidates may be inserted as `moderation_status = 'pending'` and `status = 'NEW'`.
- After running city seeds, run `supabase/fix_visible_unused_bathrooms.sql`; it converts imported venue seeds to `moderation_status = 'unused'` and `status = 'UNUSED'` so they are visible as unverified app candidates.
- Use `approved` only for bathrooms that have actually been verified.

Standard access note:

```sql
'Unverified seed throne: likely guest toilet at venue. Verify access, code/key, opening hours and facilities before approving.'
```

Post-run verification:

1. Run the city seed SQL.
2. Run `supabase/fix_visible_unused_bathrooms.sql`.
3. Run `supabase/debug_bathroom_visibility.sql`.
4. Confirm the target cities have rows in both `public.bathrooms` and `public.bathroom_cards`.

Prompt for another agent:

```text
Collect unverified venue-toilet candidates for Unpissed.

Target area: <cities/municipality>, Norway.
Output: one safe rerunnable Supabase SQL seed file.

Follow supabase/AGENT_DATA_COLLECTION_GUIDE.md exactly.
Do not invent coordinates. Use lat/lng only for verified venue-level coordinates; otherwise use null and add needs_geocoding.
Do not delete or overwrite approved bathrooms.
Use stable deterministic UUIDs.
Use moderation_status='pending' and status='NEW' in the seed; the post-seed script will convert venue seeds to unused/UNUSED.
Return a short summary with counts per city, mapped rows, missing-coordinate rows, and any assumptions.
```
