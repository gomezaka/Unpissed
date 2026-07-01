# API contract v0.5

Unpissed v0.5 talks directly to Supabase from the frontend using the Supabase anon key and Row Level Security.

There are no custom Netlify API endpoints for core app data in this version.

## Frontend reads

- `bathroom_cards` view
- `badges`
- `user_badges`
- `checkins`
- `ratings`
- `feed_events`
- `photos`

## Frontend writes

Authenticated users can:

- insert `bathrooms`
- insert `checkins`
- insert `ratings`
- insert `photos`
- insert `feed_events`
- insert `user_badges`
- insert `reports`

## Security model

- Public data is protected by Supabase RLS policies.
- The frontend only uses the anon/publishable key.
- Never expose the Supabase `service_role` key in this app.

## Remaining serverless endpoint

`/.netlify/functions/health`

Used only for deployment health checks.
