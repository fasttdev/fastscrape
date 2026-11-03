const FAIL_THRESHOLD = 3;
const COOLDOWN_MS = 60000;

class ProxyPool {
  constructor() { this.proxies = []; this.cursor = 0; this.state = new Map(); this._load(); }

  _load() {
    const raw = process.env.PROXY_LIST || '';
    for (const line of raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const p = this._parse(line);
      if (p) { this.proxies.push(p); this.state.set(p.key, { failures: 0, cooldownUntil: 0 }); }
    }
  }

  _parse(line) {
    const parts = line.split(':');
    if (parts.length !== 4) return null;
    const [host, port, user, pass] = parts;
    if (!host || !port || !user || !pass) return null;
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) return null;
    return {
      key: `${host}:${port}:${user}`,
      host, port: portNum, user, pass,
      url: `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`
    };
  }

  get size() { return this.proxies.length; }

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

  markSuccess(p) {
    if (!p) return;
    const st = this.state.get(p.key);
    if (st) { st.failures = 0; st.cooldownUntil = 0; }
  }

  markFailure(p) {
    if (!p) return;
    const st = this.state.get(p.key);
    if (!st) return;
    st.failures += 1;
    if (st.failures >= FAIL_THRESHOLD) st.cooldownUntil = Date.now() + COOLDOWN_MS;
  }

  snapshot() {
    const now = Date.now();
    return this.proxies.map(p => {
      const st = this.state.get(p.key);
      return { host: p.host, port: p.port, userMasked: p.user.slice(0,3)+'***', failures: st.failures, coolingDown: st.cooldownUntil > now };
    });
  }
}

let singleton = null;
function getProxyPool() { if (!singleton) singleton = new ProxyPool(); return singleton; }
module.exports = { getProxyPool };