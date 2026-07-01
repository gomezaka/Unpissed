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

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      mode: 'scaffold',
      moderationStatus: 'pending',
      rules: ['no_people', 'no_nudity', 'no_explicit_bathroom_content', 'useful_context_only']
    })
  };
};
