# Cloudflare R2 image plan

Use Cloudflare R2 for original uploaded images. Store only metadata in Supabase.

Recommended object keys:

```text
bathrooms/{bathroomId}/photos/{photoId}.jpg
checkins/{checkinId}/photos/{photoId}.jpg
users/{userId}/avatars/{avatarId}.jpg
```

Recommended upload flow:

1. User selects image in app.
2. App compresses/resizes locally.
3. App calls Netlify Function `r2-upload-url`.
4. Function validates auth, file type and target bathroom/check-in.
5. Function returns a temporary upload URL or upload token.
6. Browser uploads directly to R2.
7. App stores metadata in Supabase `photos` table.
8. Photo starts with `moderation_status = pending`.
9. Approved photos appear in bathroom gallery/feed.

Photo rule shown in UI:

> Show the vibe, not the victims. No people, no nudity, no disasters.
