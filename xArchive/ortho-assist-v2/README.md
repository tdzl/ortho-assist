# 🦴 OrthoAssist

AI-powered musculoskeletal diagnosis and personalised daily exercise routines. Built with React + Vite, deployable as a PWA or native iOS app via Capacitor.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Add your Anthropic API key

```bash
cp .env.example .env
# Edit .env and paste your key from https://console.anthropic.com/
```

### 3. Run locally

In **two terminals**:

```bash
# Terminal 1 — API proxy (keeps your key server-side)
node server.js

# Terminal 2 — Vite dev server
npm run dev
```

Open http://localhost:5173

---

## Deployment Options

### Option A — Vercel (Recommended, Free tier available)

1. Push this repo to GitHub
2. Import the project at https://vercel.com/new
3. In Vercel's project settings → **Environment Variables**, add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```
4. Click **Deploy** — done. Vercel automatically runs `api/anthropic.js` as a serverless function.

### Option B — Self-hosted (VPS, Raspberry Pi, etc.)

```bash
npm run build          # builds to dist/
node server.js         # serves dist/ + the API proxy on PORT (default 3001)
```

Use nginx or caddy to reverse-proxy your domain to port 3001.

---

## PWA — Install on iPhone

1. **Deploy** the app to a public HTTPS URL (Vercel, etc.)
2. Open the URL in **Safari** on your iPhone
3. Tap the **Share** button (square with arrow) → **Add to Home Screen**
4. Tap **Add** — the app now appears on your home screen with a full-screen experience

> **Note:** iOS requires Safari for PWA installation. Chrome/Firefox on iOS cannot install PWAs.

---

## Native iOS App — Capacitor

For App Store distribution or deeper native integration:

### Prerequisites
- A Mac with Xcode 15+
- [Apple Developer account](https://developer.apple.com/) ($99/year)
- Node.js 18+

### Steps

```bash
# 1. Install Capacitor
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli

# 2. Initialise (first time only)
npx cap init OrthoAssist com.yourname.orthoassist --web-dir dist

# 3. Build the web app
npm run build

# 4. Add the iOS platform
npx cap add ios

# 5. Sync web assets into the Xcode project
npx cap sync ios

# 6. Open in Xcode
npx cap open ios
```

In Xcode:
- Select your **Team** in Signing & Capabilities
- Choose your connected iPhone as the build target
- Press ▶ to run on device

> **API key in Capacitor builds:** The app still calls your deployed `/api/anthropic` endpoint, so the key stays on your server. Update the API base URL in `src/App.jsx` if needed (search for `/api/anthropic`).

---

## Project Structure

```
ortho-assist/
├── api/
│   └── anthropic.js      # Vercel serverless API proxy
├── public/
│   ├── icons/            # PWA icons + Apple splash screens
│   └── robots.txt
├── src/
│   ├── App.jsx           # Main React application
│   ├── App.css           # All styles
│   └── main.jsx          # Entry point + service worker registration
├── .env.example          # Environment variable template
├── index.html            # HTML shell with full Apple PWA meta tags
├── server.js             # Local dev proxy + self-hosting server
├── vercel.json           # Vercel deployment config
└── vite.config.js        # Vite + vite-plugin-pwa config
```

---

## Data & Privacy

All your case data and check-ins are stored in **localStorage** on your device — nothing is sent to any server except the AI conversation messages, which go to Anthropic's API through your own proxy. No account, no database, no third-party analytics.

---

## Medical Disclaimer

OrthoAssist is for informational purposes only and is not a substitute for professional medical diagnosis or treatment. Always consult a qualified healthcare provider before starting any new exercise programme.
