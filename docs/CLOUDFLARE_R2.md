# Cloudflare R2

Cloudflare R2 is not wired into v0.5.

The current production path is:

```text
Supabase Storage bucket: bathroom-photos
```

R2 can be added later if image traffic or transformation costs make it useful. For now, keeping images in Supabase Storage makes the app simpler and avoids an extra upload/signing flow.
