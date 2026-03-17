/**
 * Vercel Serverless Function — FMP Stable API Proxy
 * File: api/fmp.js
 *
 * Uses FMP's /stable/ base URL (the current endpoint structure).
 * The frontend calls /api/fmp?path=/income-statement&symbol=AAPL&limit=10
 * This function appends the secret FMP_API_KEY and proxies to FMP.
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

  // ── Debug mode: test all endpoints and show which ones work ───────────────
  if (debug === '1') return runDebug(apiKey, res);

  if (!rawPath) {
    return res.status(400).json({ error: 'Missing ?path= parameter' });
  }

  const fmpPath = decodeURIComponent(rawPath);

  // Whitelist of allowed /stable/ paths
  const allowed = [
    '/profile',
    '/income-statement',
    '/balance-sheet-statement',
    '/cash-flow-statement',
    '/key-metrics',
    '/ratios',
    '/financial-growth',
    '/quote',
    '/search',
    '/enterprise-values',
    '/historical-price-eod/full',
  ];

  if (!allowed.some(p => fmpPath === p || fmpPath.startsWith(p + '?') || fmpPath.startsWith(p + '/'))) {
    return res.status(403).json({
      error: 'Path not whitelisted: ' + fmpPath,
      allowedPaths: allowed
    });
  }

  // All requests go to https://financialmodelingprep.com/stable/<path>
  const qs = new URLSearchParams({ ...forwardParams, apikey: apiKey }).toString();
  const fmpUrl = 'https://financialmodelingprep.com/stable' + fmpPath + '?' + qs;

  console.log('Proxying to:', fmpUrl.replace(apiKey, 'REDACTED'));

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
        fmpUrl: fmpUrl.replace(apiKey, 'REDACTED'),
        hint: upstream.status === 403
          ? 'This endpoint may require a higher FMP plan. Visit /api/fmp?debug=1 to test all endpoints.'
          : upstream.status === 401
          ? 'Invalid API key — re-copy it from financialmodelingprep.com'
          : undefined
      });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(body);

  } catch (err) {
    console.error('Proxy fetch error:', err.message);
    return res.status(502).json({ error: 'Proxy failed: ' + err.message });
  }
};

// ── Debug: test every endpoint and report status ──────────────────────────
async function runDebug(apiKey, res) {
  const sym = 'AAPL';
  const base = 'https://financialmodelingprep.com/stable';
  const tests = [
    { name: 'Profile',               path: `/profile?symbol=${sym}` },
    { name: 'Quote',                 path: `/quote?symbol=${sym}` },
    { name: 'Income Statement',      path: `/income-statement?symbol=${sym}&limit=2` },
    { name: 'Balance Sheet',         path: `/balance-sheet-statement?symbol=${sym}&limit=2` },
    { name: 'Cash Flow',             path: `/cash-flow-statement?symbol=${sym}&limit=2` },
    { name: 'Key Metrics',           path: `/key-metrics?symbol=${sym}&limit=2` },
    { name: 'Ratios',                path: `/ratios?symbol=${sym}&limit=2` },
    { name: 'Financial Growth',      path: `/financial-growth?symbol=${sym}&limit=2` },
  ];

  const results = await Promise.all(tests.map(async t => {
    const url = `${base}${t.path}&apikey=${apiKey}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const text = await r.text();
      let preview = '';
      try {
        const d = JSON.parse(text);
        if (Array.isArray(d) && d.length > 0) {
          preview = `array[${d.length}] keys: ${Object.keys(d[0]).slice(0, 6).join(', ')}`;
        } else if (d && d['Error Message']) {
          preview = 'FMP Error: ' + d['Error Message'];
        } else if (d && d.error) {
          preview = 'Error: ' + d.error;
        } else {
          preview = text.substring(0, 100);
        }
      } catch (_) { preview = text.substring(0, 100); }
      return { name: t.name, status: r.status, ok: r.ok, preview };
    } catch (e) {
      return { name: t.name, status: 'TIMEOUT', ok: false, preview: e.message };
    }
  }));

  return res.status(200).json({
    message: 'FMP /stable/ endpoint availability for your API key',
    ticker: sym,
    results: results.map(r => ({
      endpoint: r.name,
      httpStatus: r.status,
      available: r.ok ? '✅ YES' : '❌ NO  (403 = plan limit)',
      preview: r.preview
    }))
  });
}
