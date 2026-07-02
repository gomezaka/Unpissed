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
    statusCode: 410,
    headers,
    body: JSON.stringify({
      error: 'Removed endpoint. The app writes check-ins through the Supabase create_checkin_with_rating RPC.'
    })
  };
};
