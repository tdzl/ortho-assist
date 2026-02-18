/**
 * Vercel Serverless Function: /api/anthropic
 *
 * Proxies requests to the Anthropic API so the API key stays server-side
 * and is never exposed to the client.
 *
 * Set ANTHROPIC_API_KEY in your Vercel project's Environment Variables.
 */

export default async function handler(req, res) {
  // CORS headers (needed for local dev; Vercel handles this in prod)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' })
  }

  const { system, messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system,
        messages,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return res.status(response.status).json({ error: error?.error?.message || 'Anthropic API error' })
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (err) {
    console.error('[api/anthropic]', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
