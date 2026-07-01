const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      mode: 'scaffold',
      message: 'Demo accepted. Replace with Supabase insert for checkins + ratings.',
      received: {
        bathroomId: payload.bathroomId || null,
        anonymous: payload.anonymous !== false
      }
    })
  };
};
