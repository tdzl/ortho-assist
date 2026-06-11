/**
 * server.js — Local development API proxy & self-hosting option
 *
 * Usage:
 *   npm install express  (one-time)
 *   node server.js       (runs on port 3001)
 *
 * In a separate terminal: npm run dev  (Vite proxies /api → port 3001)
 *
 * For self-hosting (non-Vercel): run `npm run build`, then serve the
 * dist/ folder as static files from this same Express server.
 */

import express from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env manually (no dotenv dependency needed)
try {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
  }
} catch { /* .env not present, rely on real env vars */ }

const app = express()
const PORT = process.env.PORT || 3001
const __dirname = dirname(fileURLToPath(import.meta.url))

app.use(express.json())

// ── Serve built app (production self-hosting) ──────────────────────────────
app.use(express.static(join(__dirname, 'dist')))

// ── API Proxy ──────────────────────────────────────────────────────────────
app.post('/api/anthropic', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' })
  }

  const { system, messages } = req.body

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

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Proxy error' })
  }
})

// ── SPA fallback (all non-API routes → index.html) ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`\n🦴 OrthoAssist server running on http://localhost:${PORT}`)
  console.log(`   API key: ${process.env.ANTHROPIC_API_KEY ? '✅ set' : '❌ missing — add to .env'}`)
})
