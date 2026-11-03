const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

function parseProxies() {
  return (process.env.PROXY_LIST || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const [host, port, user, pass] = line.split(':');
    if (!host || !port || !user || !pass) return null;
    return { host, port: Number(port), user, pass, url: `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}` };
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const target = (req.query && req.query.url) || 'https://example.com';
  const proxies = parseProxies();
  if (!proxies.length) { res.status(400); return res.end(JSON.stringify({ ok: false, error: 'PROXY_LIST kosong' })); }
  const p = proxies[Math.floor(Math.random() * proxies.length)];
  try {
    const agent = new HttpsProxyAgent(p.url);
    const r = await axios.get(target, { httpsAgent: agent, httpAgent: agent, proxy: false, timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.status(200);
    return res.end(JSON.stringify({ ok: true, proxy: `${p.host}:${p.port}`, status: r.status, totalProxies: proxies.length }));
  } catch (err) {
    res.status(502);
    return res.end(JSON.stringify({ ok: false, proxy: `${p.host}:${p.port}`, error: err.message || String(err), totalProxies: proxies.length }));
  }
};