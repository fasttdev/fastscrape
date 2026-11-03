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

function parseProxies() {
  return HARDCODED_PROXIES.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    const [host, port, user, pass] = line.split(':');
    if (!host || !port || !user || !pass) return null;
    return { host, port: Number(port), user, pass, url: `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}` };
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const target = (req.query && req.query.url) || 'https://example.com';
  const proxies = parseProxies();
  if (!proxies.length) { res.status(400); return res.end(JSON.stringify({ ok: false, error: 'Tidak ada proxy di kode' })); }
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