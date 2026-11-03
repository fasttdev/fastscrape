const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const HARDCODED_PROXIES = `
45.38.107.97:6014:fbfecafr:8xvxfyeqey9u
64.137.96.74:6641:fbfecafr:8xvxfyeqey9u
198.23.243.226:6361:fbfecafr:8xvxfyeqey9u
38.154.185.97:6370:fbfecafr:8xvxfyeqey9u
84.247.60.125:6095:fbfecafr:8xvxfyeqey9u
191.96.254.138:6185:fbfecafr:8xvxfyeqey9u
198.46.161.42:5092:fbfecafr:8xvxfyeqey9u
64.137.10.153:5803:fbfecafr:8xvxfyeqey9u
104.164.49.38:7693:fbfecafr:8xvxfyeqey9u
23.26.71.145:5628:fbfecafr:8xvxfyeqey9u
45.38.107.97:6014:nptkhpqp:h54farfbhtyz
64.137.96.74:6641:nptkhpqp:h54farfbhtyz
198.23.243.226:6361:nptkhpqp:h54farfbhtyz
38.154.185.97:6370:nptkhpqp:h54farfbhtyz
84.247.60.125:6095:nptkhpqp:h54farfbhtyz
191.96.254.138:6185:nptkhpqp:h54farfbhtyz
198.46.161.42:5092:nptkhpqp:h54farfbhtyz
64.137.10.153:5803:nptkhpqp:h54farfbhtyz
104.164.49.38:7693:nptkhpqp:h54farfbhtyz
23.26.71.145:5628:nptkhpqp:h54farfbhtyz
31.59.20.176:6754:giuhhvxn:d8fcfdf30xom
45.38.107.97:6014:giuhhvxn:d8fcfdf30xom
64.137.96.74:6641:giuhhvxn:d8fcfdf30xom
198.23.243.226:6361:giuhhvxn:d8fcfdf30xom
38.154.185.97:6370:giuhhvxn:d8fcfdf30xom
84.247.60.125:6095:giuhhvxn:d8fcfdf30xom
142.111.67.146:5611:giuhhvxn:d8fcfdf30xom
191.96.254.138:6185:giuhhvxn:d8fcfdf30xom
31.58.9.4:6077:giuhhvxn:d8fcfdf30xom
198.46.161.42:5092:giuhhvxn:d8fcfdf30xom
31.59.20.176:6754:yuvwfvvf:jzonez82ark8
45.38.107.97:6014:yuvwfvvf:jzonez82ark8
64.137.96.74:6641:yuvwfvvf:jzonez82ark8
198.23.243.226:6361:yuvwfvvf:jzonez82ark8
38.154.185.97:6370:yuvwfvvf:jzonez82ark8
84.247.60.125:6095:yuvwfvvf:jzonez82ark8
142.111.67.146:5611:yuvwfvvf:jzonez82ark8
191.96.254.138:6185:yuvwfvvf:jzonez82ark8
31.58.9.4:6077:yuvwfvvf:jzonez82ark8
198.46.161.42:5092:yuvwfvvf:jzonez82ark8
31.59.20.176:6754:rrwxlwav:w14oaultk4at
45.38.107.97:6014:rrwxlwav:w14oaultk4at
64.137.96.74:6641:rrwxlwav:w14oaultk4at
198.23.243.226:6361:rrwxlwav:w14oaultk4at
38.154.185.97:6370:rrwxlwav:w14oaultk4at
84.247.60.125:6095:rrwxlwav:w14oaultk4at
142.111.67.146:5611:rrwxlwav:w14oaultk4at
191.96.254.138:6185:rrwxlwav:w14oaultk4at
31.58.9.4:6077:rrwxlwav:w14oaultk4at
198.46.161.42:5092:rrwxlwav:w14oaultk4at
`.trim();

const BLOCKED_HOSTS = new Set(['localhost','127.0.0.1','0.0.0.0','::1','[::1]','metadata.google.internal','169.254.169.254']);
const BLOCKED_PROTOCOLS = new Set(['file:','ftp:','gopher:','data:','javascript:','mailto:']);
const PRIVATE_IP_REGEX = [/^10\./,/^127\./,/^169\.254\./,/^172\.(1[6-9]|2[0-9]|3[01])\./,/^192\.168\./,/^0\./,/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,/^198\.18\./,/^198\.19\./,/^::1$/,/^fc00:/i,/^fd00:/i,/^fe80:/i];

function isPrivateIp(host) {
  const h = host.replace(/^\[|\]$/g, '');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(h) && !h.includes(':')) return false;
  return PRIVATE_IP_REGEX.some(rx => rx.test(h));
}

function validateUrl(input) {
  if (!input || typeof input !== 'string') return { valid: false, reason: 'URL kosong' };
  let parsed;
  try { parsed = new URL(input.trim()); } catch { return { valid: false, reason: 'Format URL tidak valid' }; }
  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) return { valid: false, reason: 'Protokol tidak diizinkan' };
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { valid: false, reason: 'Hanya http/https' };
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return { valid: false, reason: 'Host tidak diizinkan' };
  if (isPrivateIp(host)) return { valid: false, reason: 'IP privat tidak diizinkan' };
  return { valid: true, url: parsed.toString() };
}

const PROXY_FAIL_THRESHOLD = 3;
const PROXY_COOLDOWN_MS = 60000;
class ProxyPool {
  constructor() { this.proxies = []; this.cursor = 0; this.state = new Map(); this._load(); }
  _load() {
    for (const line of HARDCODED_PROXIES.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const parts = line.split(':');
      if (parts.length !== 4) continue;
      const [host, port, user, pass] = parts;
      const portNum = Number(port);
      if (!host || !portNum || !user || !pass) continue;
      const key = `${host}:${portNum}:${user}`;
      this.proxies.push({ key, host, port: portNum, user, pass, url: `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${portNum}` });
      this.state.set(key, { failures: 0, cooldownUntil: 0 });
    }
  }
  next() {
    if (!this.proxies.length) return null;
    const now = Date.now();
    for (let i = 0; i < this.proxies.length; i++) {
      const idx = (this.cursor + i) % this.proxies.length;
      const p = this.proxies[idx];
      const st = this.state.get(p.key);
      if (st && st.cooldownUntil > now) continue;
      this.cursor = (idx + 1) % this.proxies.length;
      return p;
    }
    this.cursor = (this.cursor + 1) % this.proxies.length;
    return this.proxies[this.cursor];
  }
  markSuccess(p) { if (!p) return; const st = this.state.get(p.key); if (st) { st.failures = 0; st.cooldownUntil = 0; } }
  markFailure(p) {
    if (!p) return;
    const st = this.state.get(p.key);
    if (!st) return;
    st.failures += 1;
    if (st.failures >= PROXY_FAIL_THRESHOLD) st.cooldownUntil = Date.now() + PROXY_COOLDOWN_MS;
  }
}
let _pool = null;
function getPool() { if (!_pool) _pool = new ProxyPool(); return _pool; }

function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

  let raw = '';
  await new Promise((resolve) => {
    req.on('data', c => { raw += c; if (raw.length > 2000000) req.destroy(); });
    req.on('end', resolve);
    req.on('error', resolve);
  });

  let body;
  try { body = JSON.parse(raw || '{}'); } catch { return sendJson(res, 400, { ok: false, error: 'Body bukan JSON valid' }); }

  const { url, method = 'GET', headers = {}, body: reqBody = null } = body || {};
  const v = validateUrl(url);
  if (!v.valid) return sendJson(res, 400, { ok: false, error: v.reason });

  const cleanHeaders = {};
  Object.keys(headers).forEach(k => {
    const lk = k.toLowerCase();
    if (['host', 'content-length', 'connection', 'content-encoding', 'accept-encoding', 'origin', 'referer'].includes(lk)) return;
    cleanHeaders[k] = headers[k];
  });
  cleanHeaders['Accept-Encoding'] = 'gzip, deflate, br';
  cleanHeaders['User-Agent'] = cleanHeaders['User-Agent'] || cleanHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const pool = getPool();
  const proxy = pool.next();

  const cfg = {
    method: method.toUpperCase(),
    url: v.url,
    headers: cleanHeaders,
    data: reqBody,
    timeout: 25000,
    maxRedirects: 5,
    validateStatus: () => true,
    responseType: 'arraybuffer',
    decompress: true
  };
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy.url);
    cfg.httpsAgent = agent;
    cfg.httpAgent = agent;
    cfg.proxy = false;
  }

  try {
    const r = await axios(cfg);
    if (proxy && r.status >= 200 && r.status < 400) pool.markSuccess(proxy);
    else if (proxy) pool.markFailure(proxy);

    const contentType = String(r.headers['content-type'] || '').toLowerCase();
    const isText = /json|text|xml|javascript|html|x-www-form-urlencoded/.test(contentType);
    const buf = Buffer.from(r.data);

    let responseBody, isBase64 = false;
    if (isText) {
      responseBody = buf.toString('utf8');
    } else {
      responseBody = buf.toString('base64');
      isBase64 = true;
    }

    const outHeaders = {};
    Object.keys(r.headers).forEach(k => {
      const lk = k.toLowerCase();
      if (['content-length', 'transfer-encoding', 'connection', 'content-encoding', 'content-security-policy'].includes(lk)) return;
      outHeaders[k] = r.headers[k];
    });

    return sendJson(res, 200, {
      ok: true,
      status: r.status,
      statusText: r.statusText,
      headers: outHeaders,
      body: responseBody,
      isBase64,
      proxyUsed: proxy ? `${proxy.host}:${proxy.port}` : null
    });
  } catch (err) {
    if (proxy) pool.markFailure(proxy);
    return sendJson(res, 502, {
      ok: false,
      error: err.message || 'Proxy request gagal',
      proxyUsed: proxy ? `${proxy.host}:${proxy.port}` : null
    });
  }
};