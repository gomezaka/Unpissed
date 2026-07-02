# Unpissed Supabase Runbook

Use this order when rebuilding or refreshing the Supabase data model.

1. Run `schema.sql`.
2. Run `seed.sql` for the badge catalog.
3. Run any city seed files, for example:
   - `seed_fredrikstad_sarpsborg_v2_unverified_thrones_safe.sql`
   - `seed_moss_askim_spydeberg_v1_unverified_thrones_safe.sql`
4. Run `fix_visible_unused_bathrooms.sql`.
5. Run `debug_bathroom_visibility.sql` and check the result.

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
