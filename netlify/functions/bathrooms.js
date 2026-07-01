const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
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
      message: 'Connect this function to Supabase when backend work starts.',
      expectedTables: ['bathrooms', 'bathroom_rating_summary', 'photos']
    })
  };
};
