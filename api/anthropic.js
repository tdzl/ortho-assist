import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: req.body.system,
    messages: req.body.messages,
  });

  console.log('Calling Anthropic API...');

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        console.log('Anthropic status:', response.statusCode);
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) console.error('Anthropic error:', parsed.error);
          res.status(response.statusCode).json(parsed);
        } catch (e) {
          console.error('Failed to parse response:', data.slice(0, 200));
          res.status(500).json({ error: 'Failed to parse Anthropic response' });
        }
        resolve();
      });
    });

    request.on('error', (err) => {
      console.error('HTTPS request error:', err.message);
      res.status(500).json({ error: err.message });
      resolve();
    });

    request.write(body);
    request.end();
  });
}
