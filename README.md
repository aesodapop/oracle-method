# Oracle Method — Buffett-Grade Stock Intelligence

Real-time financial analysis powered by **Financial Modeling Prep** via a **Vercel serverless proxy**.  
Your API key never touches the browser.

---

## Project Structure

```
oracle-method/
├── index.html          ← Frontend (single-page app)
├── api/
│   └── fmp.js          ← Vercel serverless function (API proxy)
├── vercel.json         ← Vercel routing config
└── README.md
```

---

## Deploy to Vercel (5 minutes)

### Step 1 — Get a Financial Modeling Prep API key
1. Sign up free at [financialmodelingprep.com](https://financialmodelingprep.com)
2. Go to your Dashboard → copy your API key

### Step 2 — Push this repo to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/oracle-method.git
git push -u origin main
```

### Step 3 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. Leave all build settings as default (no framework preset needed)
4. Click **Deploy**

### Step 4 — Add your API key as an environment variable
1. In Vercel → your project → **Settings → Environment Variables**
2. Add:
   - **Name:** `FMP_API_KEY`
   - **Value:** your FMP API key
   - **Environment:** Production (and Preview if you want)
3. Click **Save**
4. Go to **Deployments → Redeploy** (so the new env var takes effect)

### Step 5 — Open your live URL
Vercel gives you a URL like `https://oracle-method.vercel.app`  
Type any US stock ticker (e.g. `AAPL`) and click **Analyze**.

---

## How It Works

```
Browser → /api/fmp?path=/income-statement/AAPL&limit=10
              ↓
         Vercel Function (api/fmp.js)
              ↓  appends ?apikey=YOUR_SECRET_KEY
         financialmodelingprep.com/api/v3/income-statement/AAPL
              ↓
         JSON response → back to browser
```

The `FMP_API_KEY` lives only in Vercel's server environment.  
It is never exposed in the HTML, JS, or network responses visible to users.

---

## FMP Endpoints Used

| Data | FMP Path |
|------|----------|
| Company profile + price | `/profile/{ticker}` |
| Income statement (10yr) | `/income-statement/{ticker}?period=annual&limit=10` |
| Balance sheet (10yr) | `/balance-sheet-statement/{ticker}?period=annual&limit=10` |
| Cash flow statement | `/cash-flow-statement/{ticker}?period=annual&limit=10` |
| Key metrics (ROE, ROIC, P/E) | `/key-metrics/{ticker}?period=annual&limit=10` |
| SEC filings list | `/sec-filings/{ticker}?limit=30` |

> **Free FMP plan** covers all of the above for most tickers.  
> The `/sec-filings/` endpoint may require a paid plan — if filings show empty, upgrade or the tab will display a note.

---

## Local Development

```bash
# Install Vercel CLI
npm i -g vercel

# Create a local .env file (never commit this)
echo "FMP_API_KEY=your_key_here" > .env.local

# Run locally — spins up both the frontend and /api/* functions
vercel dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Scoring Methodology

### Formula Score (100 pts)
- Revenue growth consistency — 20 pts
- Net income positivity — 15 pts  
- Debt discipline — 15 pts
- Free cash flow quality — 15 pts
- Net profit margin (avg) — 10 pts
- Cash vs earnings quality — 10 pts
- ROE ≥ 15% consistency — 10 pts
- EPS growth — 5 pts

### AI Oracle Score
Weighted blend of formula score + data richness bonus + ROIC moat bonus ± equity trend penalty. Accompanied by a plain-English narrative verdict.

---

## Customizing

To add more FMP endpoints, add the path prefix to the `allowed` whitelist in `api/fmp.js`:
```js
const allowed = [
  '/income-statement/',
  // add more here
  '/analyst-estimates/',
];
```
