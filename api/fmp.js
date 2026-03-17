/**
 * Vercel Serverless Function — FMP Proxy
 * File: api/fmp.js
 *
 * The frontend calls: /api/fmp?path=/profile/AAPL
 * This function appends FMP_API_KEY and proxies the request.
 * Your API key never appears in the browser.
 */

module.exports = async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── API key check ─────────────────────────────────────────────────────────
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'FMP_API_KEY is not set in Vercel Environment Variables.',
      fix: 'Vercel Dashboard > Project > Settings > Environment Variables > add FMP_API_KEY, then Redeploy.'
    });
  }

  // ── Extract path ──────────────────────────────────────────────────────────
  // req.query holds all ?key=value pairs as decoded strings.
  // "path" is the FMP API path e.g. /profile/AAPL
  // All other params (limit, period) are forwarded to FMP.
  const { path: fmpPath, ...forwardParams } = req.query;

  if (!fmpPath) {
    return res.status(400).json({ error: 'Missing required ?path= parameter' });
  }

  // Decode in case client double-encoded slashes
  const decodedPath = decodeURIComponent(fmpPath);

  // ── Whitelist allowed FMP paths ───────────────────────────────────────────
  const allowed = [
    '/profile/',
    '/income-statement/',
    '/balance-sheet-statement/',
    '/cash-flow-statement/',
    '/key-metrics/',
    '/financial-ratios/',
    '/sec-filings/',
    '/earnings/',
    '/historical-price-full/',
    '/quote/',
    '/search',
    '/financial-statements/',
    '/analyst-estimates/',
    '/rating/',
  ];

  if (!allowed.some(prefix => decodedPath.startsWith(prefix))) {
    return res.status(403).json({
      error: 'Path not whitelisted: ' + decodedPath,
      allowedPrefixes: allowed
    });
  }

  // ── Build FMP URL and proxy ───────────────────────────────────────────────
  const qs = new URLSearchParams({ ...forwardParams, apikey: apiKey }).toString();
  const fmpUrl = 'https://financialmodelingprep.com/api/v3' + decodedPath + '?' + qs;

  try {
    const upstream = await fetch(fmpUrl, {
      headers: { 'User-Agent': 'OracleMethod/1.0' },
      signal: AbortSignal.timeout(20000),
    });

    const body = await upstream.text();

    if (!upstream.ok) {
      console.error('FMP error ' + upstream.status + ' for ' + decodedPath + ':', body.substring(0, 300));
      return res.status(upstream.status).json({
        error: 'FMP API returned ' + upstream.status,
        detail: body.substring(0, 500),
        path: decodedPath
      });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(body);

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({
      error: 'Could not reach FMP API: ' + err.message
    });
  }
};
