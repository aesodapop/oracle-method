/**
 * Vercel Serverless Function — FMP Proxy
 * Route: /api/fmp?path=<fmp-path>&<extra-params>
 *
 * The frontend calls /api/fmp?path=/income-statement/AAPL&limit=10
 * This function appends the secret FMP_API_KEY and forwards to FMP.
 * The key never touches the browser.
 *
 * Usage:
 *   1. Set env var FMP_API_KEY in Vercel dashboard → Project → Settings → Environment Variables
 *   2. Deploy — every call from index.html goes through this function
 */

export default async function handler(req, res) {
  // ── CORS headers ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── API key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'FMP_API_KEY environment variable is not set.',
      hint: 'Add it in Vercel Dashboard → Your Project → Settings → Environment Variables'
    });
  }

  // ── Build FMP URL ─────────────────────────────────────────────────────────
  // Frontend passes ?path=/income-statement/AAPL&limit=10&period=annual
  // We strip "path" and forward all other query params to FMP
  const { path, ...rest } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Missing required query param: path' });
  }

  // Whitelist allowed FMP path prefixes for safety
  const allowed = [
    '/income-statement/',
    '/balance-sheet-statement/',
    '/cash-flow-statement/',
    '/key-metrics/',
    '/financial-ratios/',
    '/profile/',
    '/sec-filings/',
    '/earnings/',
    '/historical-price-full/',
    '/quote/',
    '/search',
    '/financial-statements/',
  ];

  const isAllowed = allowed.some(prefix => path.startsWith(prefix));
  if (!isAllowed) {
    return res.status(403).json({ error: `Path not whitelisted: ${path}` });
  }

  // Build query string — forward any extra params (limit, period, etc.)
  const params = new URLSearchParams({ ...rest, apikey: apiKey });
  const fmpUrl = `https://financialmodelingprep.com/api/v3${path}?${params}`;

  // ── Proxy request ─────────────────────────────────────────────────────────
  try {
    const upstream = await fetch(fmpUrl, {
      headers: { 'User-Agent': 'OracleMethod/1.0' },
      signal: AbortSignal.timeout(25000),
    });

    const contentType = upstream.headers.get('content-type') || 'application/json';
    const body = await upstream.text();

    // Cache for 1 hour — FMP data doesn't change minute-to-minute
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', contentType);
    return res.status(upstream.status).send(body);

  } catch (err) {
    console.error('FMP proxy error:', err);
    return res.status(502).json({
      error: 'Failed to reach Financial Modeling Prep API',
      detail: err.message
    });
  }
}
