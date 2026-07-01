# Unpissed API contract draft

The static prototype runs without a backend. These endpoints are scaffolds for the first Netlify/Supabase connection.

## `GET /.netlify/functions/bathrooms`
Returns nearby bathrooms with rating summary, facilities, access mode and photo metadata.

Future query params:
- `lat`
- `lng`
- `radius_meters`
- `min_rating`
- `access_mode`
- `open_now`
- `facility`

## `POST /.netlify/functions/bathrooms`
Creates a new bathroom suggestion.

Required fields:
- `name`
- `type`
- `access_note`
- `lat`
- `lng`

## `POST /.netlify/functions/checkins`
Creates a check-in and rating.

Required fields:
- `bathroomId`
- `anonymous`
- `criteria`
- `comment`
- `photoId` optional

## `POST /.netlify/functions/r2-upload-url`
Creates a short-lived upload permission for Cloudflare R2.

Future checks:
- user is authenticated
- file type is image/jpeg, image/png or image/webp
- file size is within limit
- bathroom/check-in exists

## `POST /.netlify/functions/moderate-image`
Creates or updates image moderation state.

Rules:
- no people
- no nudity
- no explicit bathroom content
- no children
- useful location/vibe context only
