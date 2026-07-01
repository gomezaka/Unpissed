// Placeholder function for the real Cloudflare R2 upload flow.
// In production this should create a short-lived signed upload URL after verifying the logged-in user.

const requiredEnv = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_R2_BUCKET',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY'
];

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    return json(501, {
      error: 'Cloudflare R2 upload is not configured yet.',
      missing
    });
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const filename = String(payload.filename || '').trim();
  const contentType = String(payload.contentType || '').trim();
  const bathroomId = String(payload.bathroomId || '').trim();

  if (!filename || !contentType.startsWith('image/') || !bathroomId) {
    return json(400, { error: 'filename, image contentType and bathroomId are required.' });
  }

  // TODO: verify Supabase JWT from Authorization header.
  // TODO: generate a signed PUT URL using AWS SDK S3Client pointed at Cloudflare R2.
  // TODO: return { uploadUrl, publicUrl, storageKey }.

  return json(501, {
    error: 'Signed upload URL generation has not been implemented yet.',
    storageKey: `bathrooms/${bathroomId}/photos/${Date.now()}-${safeName(filename)}`
  });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'photo.jpg';
}
