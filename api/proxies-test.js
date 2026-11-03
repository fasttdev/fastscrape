const { validateUrl } = require('../lib/urlValidator');
const { fetchWithProxyRotation } = require('../lib/scraper');
const { getProxyPool } = require('../lib/proxies');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const pool = getProxyPool();
  const target = (req.query?.url) || 'https://example.com';
  const v = validateUrl(target);
  if (!v.valid) { res.status(400); return res.end(JSON.stringify({ ok: false, error: v.reason })); }
  try {
    const r = await fetchWithProxyRotation(v.url);
    res.status(200);
    return res.end(JSON.stringify({ ok: true, testedUrl: v.url, status: r.status, proxyUsed: r.proxyUsed, attempts: r.attempts, proxies: pool.snapshot() }));
  } catch (err) {
    res.status(502);
    return res.end(JSON.stringify({ ok: false, testedUrl: v.url, error: err.message, code: err.code, attempts: err.attempts || [], proxies: pool.snapshot() }));
  }
};