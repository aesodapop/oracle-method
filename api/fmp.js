/**
 * Vercel Serverless Function — FMP Proxy
 * File: api/fmp.js
 *
 * Proxies requests to Financial Modeling Prep, keeping the API key server-side.
 * Also handles a /api/fmp?debug=1 mode to show raw FMP responses for troubleshooting.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'FMP_API_KEY environment variable is not set.',
      fix: 'Vercel Dashboard → Project → Settings → Environment Variables → add FMP_API_KEY → Redeploy'
    });
  }

  const { path: rawPath, debug, ...forwardParams } = req.query;

  // ── Debug mode: test all key endpoints and report status ─────────────────
  if (debug === '1' || rawPath === '/debug') {
    return runDebug(apiKey, res);
  }

  if (!rawPath) {
    return res.status(400).json({ error: 'Missing ?path= parameter' });
  }

  const fmpPath = decodeURIComponent(rawPath);

  // Whitelist
  const allowed = [
    '/profile/', '/income-statement/', '/balance-sheet-statement/',
    '/cash-flow-statement/', '/key-metrics/', '/financial-ratios/',
    '/sec-filings/', '/earnings/', '/historical-price-full/', '/quote/',
    '/search', '/financial-statements/', '/analyst-estimates/', '/rating/',
    '/v4/income-statement', '/v4/balance-sheet', '/v4/cash-flow',
    '/financial-growth/', '/enterprise-values/',
  ];
  if (!allowed.some(p => fmpPath.startsWith(p))) {
    return res.status(403).json({ error: 'Path not whitelisted: ' + fmpPath });
  }

  // Build URL — paths starting with /v4/ use the v4 base, others use v3
  const base = fmpPath.startsWith('/v4/')
    ? 'https://financialmodelingprep.com/api'
    : 'https://financialmodelingprep.com/api/v3';

  const pathPart = fmpPath.startsWith('/v4/') ? fmpPath : fmpPath;
  const qs = new URLSearchParams({ ...forwardParams, apikey: apiKey }).toString();
  const fmpUrl = base + pathPart + '?' + qs;

  try {
    const upstream = await fetch(fmpUrl, {
      headers: { 'User-Agent': 'OracleMethod/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    const body = await upstream.text();

    if (!upstream.ok) {
      let detail = body.substring(0, 600);
      try {
        const parsed = JSON.parse(body);
        detail = parsed['Error Message'] || parsed.message || parsed.error || detail;
      } catch (_) {}

      console.error(`FMP ${upstream.status} [${fmpPath}]:`, detail);
      return res.status(upstream.status).json({
        error: `FMP returned ${upstream.status} for ${fmpPath}`,
        detail,
        hint: upstream.status === 403
          ? 'This endpoint requires a paid FMP plan. Check /api/fmp?debug=1 to see which endpoints your key can access.'
          : upstream.status === 401
          ? 'Invalid API key. Re-copy it from financialmodelingprep.com/developer/docs'
          : undefined
      });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(body);
  } catch (err) {
    return res.status(502).json({ error: 'Proxy fetch failed: ' + err.message });
  }
};

// ── Debug: hit every endpoint we use and report which ones work ─────────────
async function runDebug(apiKey, res) {
  const ticker = 'AAPL';
  const tests = [
    { name: 'Profile (v3)',            url: `/api/v3/profile/${ticker}` },
    { name: 'Income Statement (v3)',   url: `/api/v3/income-statement/${ticker}?limit=2&period=annual` },
    { name: 'Balance Sheet (v3)',      url: `/api/v3/balance-sheet-statement/${ticker}?limit=2&period=annual` },
    { name: 'Cash Flow (v3)',          url: `/api/v3/cash-flow-statement/${ticker}?limit=2&period=annual` },
    { name: 'Key Metrics (v3)',        url: `/api/v3/key-metrics/${ticker}?limit=2&period=annual` },
    { name: 'Financial Ratios (v3)',   url: `/api/v3/financial-ratios/${ticker}?limit=2&period=annual` },
    { name: 'Income Statement (v4)',   url: `/api/v4/income-statement?symbol=${ticker}&period=annual&limit=2` },
    { name: 'Balance Sheet (v4)',      url: `/api/v4/balance-sheet-statement?symbol=${ticker}&period=annual&limit=2` },
    { name: 'Cash Flow (v4)',          url: `/api/v4/cash-flow-statement?symbol=${ticker}&period=annual&limit=2` },
    { name: 'Financial Growth (v3)',   url: `/api/v3/financial-growth/${ticker}?limit=2&period=annual` },
    { name: 'SEC Filings (v3)',        url: `/api/v3/sec-filings/${ticker}?limit=5` },
    { name: 'Quote (v3)',              url: `/api/v3/quote/${ticker}` },
    { name: 'Enterprise Value (v3)',   url: `/api/v3/enterprise-values/${ticker}?limit=2&period=annual` },
  ];

  const results = await Promise.all(tests.map(async t => {
    const url = `https://financialmodelingprep.com${t.url}${t.url.includes('?') ? '&' : '?'}apikey=${apiKey}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const text = await r.text();
      let preview = '';
      try {
        const d = JSON.parse(text);
        if (Array.isArray(d) && d.length > 0) preview = `array[${d.length}] — first keys: ${Object.keys(d[0]).slice(0,5).join(', ')}`;
        else if (d['Error Message']) preview = 'ERROR: ' + d['Error Message'];
        else if (d.error) preview = 'ERROR: ' + d.error;
        else preview = JSON.stringify(d).substring(0, 80);
      } catch (_) { preview = text.substring(0, 80); }
      return { name: t.name, status: r.status, ok: r.ok, preview };
    } catch (e) {
      return { name: t.name, status: 'ERR', ok: false, preview: e.message };
    }
  }));

  return res.status(200).json({
    info: 'FMP endpoint availability for your API key',
    ticker,
    results: results.map(r => ({
      endpoint: r.name,
      status: r.status,
      available: r.ok ? '✅ YES' : '❌ NO',
      detail: r.preview
    }))
  });
}
