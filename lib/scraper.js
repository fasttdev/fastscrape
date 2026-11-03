const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { getProxyPool } = require('./proxies');

const TIMEOUT = 6000;
const MAX_ATTEMPTS = 2;
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0'
];

function headers() {
  return {
    'User-Agent': UAS[Math.floor(Math.random() * UAS.length)],
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache'
  };
}

async function fetchOnce(url, proxy, timeout) {
  const cfg = { timeout, maxRedirects: 5, responseType: 'text', validateStatus: s => s >= 200 && s < 400, headers: headers() };
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy.url);
    cfg.httpsAgent = agent; cfg.httpAgent = agent; cfg.proxy = false;
  }
  const res = await axios.get(url, cfg);
  return {
    html: typeof res.data === 'string' ? res.data : String(res.data),
    status: res.status,
    finalUrl: res.request?.res?.responseUrl || url,
    contentType: res.headers['content-type'] || ''
  };
}

async function fetchWithProxyRotation(url) {
  const pool = getProxyPool();
  const attempts = [];
  let lastErr = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const proxy = pool.size > 0 ? pool.next() : null;
    const t0 = Date.now();
    try {
      const r = await fetchOnce(url, proxy, TIMEOUT);
      if (proxy) pool.markSuccess(proxy);
      attempts.push({ proxy: proxy ? `${proxy.host}:${proxy.port}` : 'direct', ok: true, durationMs: Date.now() - t0 });
      return { ...r, proxyUsed: proxy ? `${proxy.host}:${proxy.port}` : null, attempts };
    } catch (err) {
      if (proxy) pool.markFailure(proxy);
      lastErr = err;
      attempts.push({ proxy: proxy ? `${proxy.host}:${proxy.port}` : 'direct', ok: false, durationMs: Date.now() - t0, error: err.code || err.message });
    }
  }

  const f = normalizeErr(lastErr);
  const e = new Error(f.message);
  e.code = f.code;
  e.attempts = attempts;
  throw e;
}

function normalizeErr(err) {
  if (!err) return { code: 'UNKNOWN', message: 'Gagal mengambil halaman' };
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return { code: 'TIMEOUT', message: 'Situs target lambat atau proxy timeout' };
  if (err.response) {
    const s = err.response.status;
    if (s === 403) return { code: 'FORBIDDEN', message: 'Situs target menolak (403)' };
    if (s === 404) return { code: 'NOT_FOUND', message: 'Halaman tidak ditemukan (404)' };
    if (s === 429) return { code: 'RATE_LIMITED', message: 'Situs target membatasi (429)' };
    return { code: 'HTTP_ERROR', message: `Situs target merespons ${s}` };
  }
  if (err.code === 'ENOTFOUND') return { code: 'DNS', message: 'Domain tidak ditemukan' };
  return { code: err.code || 'FETCH_FAILED', message: err.message || 'Gagal' };
}

module.exports = { fetchWithProxyRotation };