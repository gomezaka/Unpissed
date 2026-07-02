exports.handler = async function handler() {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({ ok: true, app: 'unpissed', version: '0.6.1' })
  };
};
