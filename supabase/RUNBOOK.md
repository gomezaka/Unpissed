# Unpissed Supabase Runbook

Use this order when rebuilding or refreshing the Supabase data model.

1. Run `schema.sql`.
2. Run `seed.sql` for the badge catalog.
3. If bad imported venue coordinates already exist, run `reset_unverified_seed_bathrooms_for_location_qa.sql`.
   - This copies unverified/imported venue seeds into `location_qa_candidates`.
   - It deletes those seed rows from `bathrooms`.
   - It does not delete approved rows or user-added rows.
   - If the scraper later says `PGRST205` / table not found, run `notify pgrst, 'reload schema';` in Supabase SQL Editor and retry.
4. Run the automated location scraper from the repo root.

   Recommended bulk mode is local Geofabrik data. It needs `osmium` on PATH for the first index build:

   ```powershell
   npm run geo:seeds -- --backend local --download-pbf --build-local-index --threshold 86 --no-nominatim
   ```

   Later runs can reuse the local index:

   ```powershell
   npm run geo:seeds -- --backend local --threshold 86 --no-nominatim
   ```

   The scraper:
   - Reads `location_qa_candidates` through the Supabase REST API.
   - Uses local Geofabrik/OpenStreetMap data when available.
   - Falls back to Overpass mirrors only when running without local data.
   - Uses Nominatim only as optional fallback for unresolved venues.
   - Fuzzy-matches venue name, address, city and type.
   - Writes reviewable files under `tools/output/`.
   - Does not write to Supabase directly.

5. Review and run `tools/output/location_qa_autofix.sql` in Supabase SQL Editor.
   - This inserts only high-confidence matches.
   - It uses `moderation_status = 'unused'` and `status = 'UNUSED'`.
   - It will not overwrite approved or user-added bathroom rows on conflict.
6. Open `tools/output/location_qa_review.csv` for low-confidence/no-match rows.
   - Use `http://localhost:8080/tools/location_qa.html` only for rows that need manual review.
   - Run generated SQL for manually accepted rows.
7. Run `fix_visible_unused_bathrooms.sql`.
8. Run `debug_bathroom_visibility.sql` and check the result.

Useful scraper commands:

```powershell
npm run geo:seeds -- --backend overpass --city Fredrikstad,Sarpsborg --threshold 88
npm run geo:seeds -- --city Fredrikstad,Sarpsborg --threshold 88
npm run geo:seeds -- --limit 25 --dry-run
npm run geo:seeds -- --input candidates.json --out tools/output
```

Default Overpass mirrors, in order:

- `https://overpass.private.coffee/api/interpreter`
- `https://overpass.kumi.systems/api/interpreter`
- `https://overpass-api.de/api/interpreter`

Expected status model:

- `approved`: verified and visible.
- `unused`: unverified candidate, visible in the app.
- `pending`: not public yet; post-seed repair converts venue seeds from `pending` to `unused`.
- `rejected` / `hidden`: not visible.

Important app behavior:

- Nearby must use real device location only.
- SQL must not create fallback location behavior.
- Rows without `lat`/`lng` can be listed/searchable, but they cannot be mapped or routed until coordinates are verified.

After `debug_bathroom_visibility.sql`, these are healthy signs:

- `bathroom_cards` has `security_invoker=true`.
- Fredrikstad, Sarpsborg, Moss, Askim and Spydeberg show matching `bathrooms_rows` and `bathroom_cards_rows` when those seeds have been run.
- `frontend_pages_needed_at_1000_rows` may be above 1; the frontend now paginates all rows.
