# API contract v0.6.1

Unpissed talks directly to Supabase from the frontend using the Supabase anon key and Row Level Security.

There are no custom Netlify API endpoints for core app data in this version.

## Frontend reads

- `bathroom_cards` view
- `badges`
- `user_badges`
- `checkins`
- `ratings`
- `feed_events`
- `photos`
- `follows`

## Frontend writes

Authenticated users can:

- insert `bathrooms`
- call `create_checkin_with_rating` to insert check-ins, ratings and feed events atomically
- insert `photos`
- insert `feed_events`
- insert/delete `follows`
- insert `user_badges`
- insert `reports`

## Security model

- Public data is protected by Supabase RLS policies.
- Feed visibility is enforced in RLS: public events are public, private events are actor-only, and friends events require mutual follows.
- `unused` bathrooms are public, visible and unverified. `pending` bathrooms/photos are moderation-only until approved.
- The frontend only uses the anon/publishable key.
- Never expose the Supabase `service_role` key in this app.

## Remaining serverless endpoint

`/.netlify/functions/health`

Used only for deployment health checks.
