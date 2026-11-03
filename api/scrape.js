const axios = require('axios');
const cheerio = require('cheerio');
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
function getProxyPool() { if (!_pool) _pool = new ProxyPool(); return _pool; }

const RL_WINDOW = 60000;
const RL_MAX = 30;
const _rlBuckets = new Map();
function rateLimit(req) {
  const xff = req.headers['x-forwarded-for'];
  const key = (typeof xff === 'string' && xff) ? xff.split(',')[0].trim() : (req.socket?.remoteAddress || 'unknown');
  const now = Date.now();
  let b = _rlBuckets.get(key);
  if (!b || now - b.start >= RL_WINDOW) { b = { start: now, count: 0 }; _rlBuckets.set(key, b); }
  b.count += 1;
  if (_rlBuckets.size > 2000) for (const [k, v] of _rlBuckets) if (now - v.start >= RL_WINDOW) _rlBuckets.delete(k);
  return { allowed: b.count <= RL_MAX, remaining: Math.max(0, RL_MAX - b.count), resetAt: b.start + RL_WINDOW };
}

const FETCH_TIMEOUT = 6000;
const JS_TIMEOUT = 3000;
const MAX_ATTEMPTS = 2;
const MAX_EXTERNAL_SCRIPTS = 15;
const MAX_JS_SIZE = 300000;
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
];
function buildHeaders() {
  return { 'User-Agent': UAS[Math.floor(Math.random() * UAS.length)], 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9,id;q=0.8', 'Cache-Control': 'no-cache' };
}
function safeErrMessage(err) {
  if (!err) return 'UNKNOWN';
  if (typeof err === 'string') return err;
  if (typeof err.code === 'string') return err.code;
  if (typeof err.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return 'UNKNOWN'; }
}
function normalizeFetchErr(err) {
  if (!err) return { code: 'UNKNOWN', message: 'Gagal mengambil halaman' };
  const code = typeof err.code === 'string' ? err.code : 'FETCH_FAILED';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return { code: 'TIMEOUT', message: 'Situs target lambat atau proxy timeout' };
  if (err.response) {
    const s = err.response.status;
    if (s === 403) return { code: 'FORBIDDEN', message: 'Situs target menolak (403)' };
    if (s === 404) return { code: 'NOT_FOUND', message: 'Halaman tidak ditemukan (404)' };
    if (s === 429) return { code: 'RATE_LIMITED', message: 'Situs target membatasi (429)' };
    return { code: 'HTTP_ERROR', message: `Situs target merespons ${s}` };
  }
  if (code === 'ENOTFOUND') return { code: 'DNS', message: 'Domain tidak ditemukan' };
  return { code, message: safeErrMessage(err) };
}
async function fetchOnce(url, proxy, timeout) {
  const cfg = { timeout, maxRedirects: 5, responseType: 'text', validateStatus: s => s >= 200 && s < 400, headers: buildHeaders() };
  if (proxy) {
    const agent = new HttpsProxyAgent(proxy.url);
    cfg.httpsAgent = agent; cfg.httpAgent = agent; cfg.proxy = false;
  }
  const res = await axios.get(url, cfg);
  return { html: typeof res.data === 'string' ? res.data : String(res.data), status: res.status, finalUrl: res.request?.res?.responseUrl || url };
}
async function fetchWithProxyRotation(url) {
  const pool = getProxyPool();
  const attempts = [];
  let lastErr = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const proxy = pool.size > 0 ? pool.next() : null;
    const t0 = Date.now();
    try {
      const r = await fetchOnce(url, proxy, FETCH_TIMEOUT);
      if (proxy) pool.markSuccess(proxy);
      attempts.push({ proxy: proxy ? `${proxy.host}:${proxy.port}` : 'direct', ok: true, durationMs: Date.now() - t0 });
      return { ...r, proxyUsed: proxy ? `${proxy.host}:${proxy.port}` : null, attempts };
    } catch (err) {
      if (proxy) pool.markFailure(proxy);
      lastErr = err;
      attempts.push({ proxy: proxy ? `${proxy.host}:${proxy.port}` : 'direct', ok: false, durationMs: Date.now() - t0, error: safeErrMessage(err) });
    }
  }
  const f = normalizeFetchErr(lastErr);
  const e = new Error(f.message);
  e.code = f.code;
  e.attempts = attempts;
  throw e;
}

const norm = s => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
const abs = (base, raw) => { if (!raw) return ''; try { return new URL(raw, base).toString(); } catch { return raw; } };

function parseHtml(html, baseUrl, mode, customSelector) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const data = {
    url: baseUrl,
    domain: (() => { try { return new URL(baseUrl).hostname; } catch { return ''; } })(),
    scrapedAt: new Date().toISOString(),
  };

  data.meta = {
    title: norm($('title').first().text()),
    description: norm($('meta[name="description"]').attr('content')),
    keywords: norm($('meta[name="keywords"]').attr('content')),
    author: norm($('meta[name="author"]').attr('content')),
    generator: norm($('meta[name="generator"]').attr('content')),
    canonical: abs(baseUrl, $('link[rel="canonical"]').attr('href') || ''),
    og: {
      title: norm($('meta[property="og:title"]').attr('content')),
      description: norm($('meta[property="og:description"]').attr('content')),
      image: abs(baseUrl, $('meta[property="og:image"]').attr('content') || ''),
      type: norm($('meta[property="og:type"]').attr('content')),
      url: norm($('meta[property="og:url"]').attr('content'))
    },
    twitter: {
      card: norm($('meta[name="twitter:card"]').attr('content')),
      title: norm($('meta[name="twitter:title"]').attr('content')),
      description: norm($('meta[name="twitter:description"]').attr('content')),
      image: abs(baseUrl, $('meta[name="twitter:image"]').attr('content') || '')
    }
  };
  data.title = data.meta.og.title || data.meta.title || '';
  data.description = data.meta.og.description || data.meta.description || '';

  data.structuredData = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { data.structuredData.push(JSON.parse($(el).html())); } catch (_) {}
  });

  if (mode === 'all' || mode === 'text') {
    const headings = [];
    for (let lv = 1; lv <= 6; lv++) $('h' + lv).each((_, el) => { const t = norm($(el).text()); if (t) headings.push({ level: lv, text: t }); });
    data.headings = headings;
    const paragraphs = [];
    $('p').each((_, el) => { const t = norm($(el).text()); if (t.length >= 3) paragraphs.push(t); });
    if (paragraphs.length === 0) {
      const fallback = [];
      $('article, main, section, div').each((_, el) => {
        const clone = $(el).clone(); clone.children().remove();
        const t = norm(clone.text());
        if (t.length >= 30) fallback.push(t);
      });
      if (fallback.length > 0) { data.paragraphs = fallback; data._fallback = 'div-article'; }
      else data.paragraphs = [];
    } else data.paragraphs = paragraphs;
    const bodyText = norm($('body').text());
    if (bodyText) data.rawText = bodyText.slice(0, 5000);
    if (!data.title && bodyText.length < 200) data._warning = 'Situs ini kemungkinan SPA (JavaScript-rendered). Konten asli tidak ada di HTML mentah.';
  }

  if (mode === 'all' || mode === 'links') {
    const seen = new Set(); const links = [];
    $('a[href]').each((_, el) => {
      const url = abs(baseUrl, $(el).attr('href') || '');
      if (!url || seen.has(url)) return;
      seen.add(url);
      links.push({ url, text: norm($(el).text()), rel: norm($(el).attr('rel') || ''), target: norm($(el).attr('target') || '') });
    });
    data.links = links;
  }

  if (mode === 'all' || mode === 'images') {
    const seen = new Set(); const imgs = [];
    $('img').each((_, el) => {
      const raw = $(el).attr('src') || $(el).attr('data-src') || '';
      const url = abs(baseUrl, raw);
      if (!url || seen.has(url)) return;
      seen.add(url);
      imgs.push({ url, alt: norm($(el).attr('alt') || ''), width: $(el).attr('width') || null, height: $(el).attr('height') || null });
    });
    data.images = imgs;
  }

  if (mode === 'all' || mode === 'tables') {
    const tables = [];
    $('table').each((idx, tEl) => {
      const $t = $(tEl);
      const caption = norm($t.find('caption').first().text());
      const headers = [];
      $t.find('thead tr').first().find('th, td').each((_, th) => headers.push(norm($(th).text())));
      const rows = [];
      $t.find('tbody tr').each((_, tr) => { const cells = []; $(tr).find('td, th').each((_, c) => cells.push(norm($(c).text()))); if (cells.length) rows.push(cells); });
      if (headers.length || rows.length) tables.push({ index: idx, caption, headers, rows });
    });
    data.tables = tables;
  }

  if (mode === 'custom') {
    data.customSelector = customSelector;
    const results = []; const seen = new Set();
    $(customSelector).each((_, el) => {
      const $el = $(el);
      const item = { tag: el.tagName ? el.tagName.toLowerCase() : 'unknown', text: norm($el.text()), html: $el.html() ? $el.html().trim().slice(0, 2000) : '', href: abs(baseUrl, $el.attr('href') || ''), src: abs(baseUrl, $el.attr('src') || '') };
      const k = `${item.tag}|${item.text.slice(0,80)}|${item.href}|${item.src}`;
      if (seen.has(k)) return;
      seen.add(k);
      results.push(item);
    });
    data.custom = results;
  }

  data.stats = {
    headings: data.headings?.length || 0,
    paragraphs: data.paragraphs?.length || 0,
    links: data.links?.length || 0,
    images: data.images?.length || 0,
    tables: data.tables?.length || 0,
    custom: data.custom?.length || 0
  };
  return data;
}

// ==================== MIRROR MODE (UPGRADED: AUTO-PROXY API) ====================
async function scrapeMirror(url) {
  const f = await fetchWithProxyRotation(url);
  let html = f.html;

  html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  html = html.replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');

  const finalUrl = f.finalUrl || url;
  const targetOrigin = new URL(finalUrl).origin;

  const interceptor = `<script>(function(){
var PROXY='/api/proxy';
var TARGET_ORIGIN=${JSON.stringify(targetOrigin)};
var BASE_URL=${JSON.stringify(finalUrl)};
function resolveUrl(raw){try{return new URL(raw,BASE_URL).toString();}catch(e){return raw;}}
function sameOrigin(u){try{return new URL(u).origin===TARGET_ORIGIN;}catch(e){return false;}}
function headersToObj(h){var o={};try{new Headers(h||{}).forEach(function(v,k){var lk=k.toLowerCase();if(lk==='host'||lk==='content-length'||lk==='connection')return;o[k]=v;});}catch(e){}return o;}
function toResponse(data){var h=new Headers();Object.keys(data.headers||{}).forEach(function(k){try{h.set(k,data.headers[k]);}catch(e){}});var body=data.body;if(data.isBase64){var bin=atob(body);var bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);body=bytes;}return new Response(body,{status:data.status,statusText:data.statusText||'',headers:h});}
async function proxyRequest(targetUrl,method,headers,body){var res=await _fetch.call(window,PROXY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:targetUrl,method:method,headers:headers,body:body})});var data=await res.json();if(!data.ok)throw new Error(data.error||'proxy fail');return toResponse(data);}
var _fetch=window.fetch;
window.fetch=function(input,init){
init=init||{};
var isReq=(typeof input==='object'&&input&&input.url);
var rawUrl=isReq?input.url:String(input);
var fullUrl=resolveUrl(rawUrl);
if(!sameOrigin(fullUrl))return _fetch.apply(this,arguments);
var method=isReq?(input.method||'GET'):(init.method||'GET');
var headers=isReq?headersToObj(input.headers):headersToObj(init.headers);
var bodyPromise;
if(isReq&&method!=='GET'&&method!=='HEAD')bodyPromise=input.text();
else if(init.body!=null)bodyPromise=Promise.resolve(typeof init.body==='string'?init.body:String(init.body));
else bodyPromise=Promise.resolve(null);
return bodyPromise.then(function(b){return proxyRequest(fullUrl,method,headers,b);});
};
})();</script>`;

  const baseTag = `<base href="${finalUrl}">`;

  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${interceptor}`);
  } else {
    html = baseTag + interceptor + html;
  }

  return { html, proxyUsed: f.proxyUsed, status: f.status, finalUrl, attempts: f.attempts };
}

// ==================== SCRIPTS MODE ====================
async function scrapeScripts(targetUrl) {
  const pageFetch = await fetchWithProxyRotation(targetUrl);
  const html = pageFetch.html;
  const baseUrl = pageFetch.finalUrl || targetUrl;
  const $ = cheerio.load(html);
  const pool = getProxyPool();
  const scriptElements = $('script').toArray();
  const results = new Array(scriptElements.length);
  const externalTasks = [];
  let externalCount = 0;

  for (let i = 0; i < scriptElements.length; i++) {
    const el = scriptElements[i];
    const $el = $(el);
    const src = $el.attr('src');
    const type = $el.attr('type') || 'text/javascript';

    if (src) {
      if (externalCount >= MAX_EXTERNAL_SCRIPTS) {
        results[i] = { index: i, type: 'external', src: abs(baseUrl, src), mimeType: type, skipped: true, reason: 'Melebihi batas ' + MAX_EXTERNAL_SCRIPTS };
        continue;
      }
      externalCount++;
      const absSrc = abs(baseUrl, src);
      externalTasks.push(
        fetchOnce(absSrc, pool.size > 0 ? pool.next() : null, JS_TIMEOUT)
          .then(f => {
            const code = f.html || '';
            results[i] = { index: i, type: 'external', src: absSrc, mimeType: type, size: code.length, code: code.length > MAX_JS_SIZE ? code.slice(0, MAX_JS_SIZE) + '\n/* TRUNCATED */' : code };
          })
          .catch(err => { results[i] = { index: i, type: 'external', src: absSrc, mimeType: type, error: safeErrMessage(err) }; })
      );
    } else {
      const code = $el.html() || '';
      if (code.trim().length > 0) {
        results[i] = { index: i, type: 'inline', mimeType: type, size: code.length, code: code.length > MAX_JS_SIZE ? code.slice(0, MAX_JS_SIZE) + '\n/* TRUNCATED */' : code };
      }
    }
  }

  await Promise.allSettled(externalTasks);
  const scripts = results.filter(Boolean);

  return {
    url: targetUrl,
    finalUrl: baseUrl,
    totalScripts: scripts.length,
    inlineCount: scripts.filter(s => s.type === 'inline').length,
    externalCount: scripts.filter(s => s.type === 'external').length,
    failedCount: scripts.filter(s => s.error).length,
    skippedCount: scripts.filter(s => s.skipped).length,
    scripts,
    proxyUsed: pageFetch.proxyUsed,
    attempts: pageFetch.attempts
  };
}

// ==================== EXPORTER & HANDLER ====================
function buildJsFile(payload, options) {
  const name = options.variableName && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(options.variableName) ? options.variableName : 'scrapedData';
  const header = `// Generated by FASTSCRAPE\n// Source URL: ${payload.result?.url || ''}\n// Scraped at: ${new Date().toISOString()}\n\n`;
  const body = `const ${name} = ${JSON.stringify(payload, null, 2)};\n`;
  const footer = `\nif (typeof module !== "undefined" && module.exports) {\n  module.exports = ${name};\n}\n`;
  return header + body + footer;
}
function buildFilename(url, mode) {
  let host = 'scrape';
  try { host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_'); } catch {}
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${host}_${String(mode||'all').replace(/[^a-z0-9]/gi,'')}_${ts}.js`;
}
const VALID_MODES = new Set(['all','text','links','images','tables','custom','mirror','scripts']);
function sendJson(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); }
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1000000) { reject(new Error('Body terlalu besar')); req.destroy(); } });
    req.on('end', () => { if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch { reject(new Error('Body bukan JSON valid')); } });
    req.on('error', reject);
  });
}
function normalizeError(err) {
  if (!err) return 'Terjadi kesalahan.';
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string') return err.message;
  try { return JSON.stringify(err); } catch { return 'Terjadi kesalahan.'; }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, proxiesLoaded: getProxyPool().size, message: 'Endpoint aktif.' });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method tidak diizinkan' });

  const limit = rateLimit(req);
  if (!limit.allowed) { res.setHeader('Retry-After', Math.ceil((limit.resetAt - Date.now()) / 1000)); return sendJson(res, 429, { ok: false, error: 'Terlalu banyak permintaan' }); }

  let body;
  try { body = await readJson(req); } catch (err) { return sendJson(res, 400, { ok: false, error: normalizeError(err) }); }

  const { url, mode = 'all', customSelector = '', variableName = 'scrapedData' } = body || {};
  if (!VALID_MODES.has(mode)) return sendJson(res, 400, { ok: false, error: 'Mode tidak valid' });
  if (mode === 'custom' && !customSelector) return sendJson(res, 400, { ok: false, error: 'customSelector wajib' });

  const v = validateUrl(url);
  if (!v.valid) return sendJson(res, 400, { ok: false, error: v.reason });

  if (mode === 'mirror') {
    const startTime = Date.now();
    try {
      const m = await scrapeMirror(v.url);
      const filename = buildFilename(v.url, 'mirror').replace(/\.js$/, '.html');
      res.status(200);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Scrape-Proxy', String(m.proxyUsed || 'direct'));
      return res.end(m.html);
    } catch (err) {
      return sendJson(res, 502, { status: false, error: normalizeError(err), code: normalizeError(err.code || 'MIRROR_FAILED') });
    }
  }

  if (mode === 'scripts') {
    const startTime = Date.now();
    try {
      const data = await scrapeScripts(v.url);
      const finalPayload = { creator: 'FortechDev', engine: 'fastscrape-js-extractor', time: `${Date.now() - startTime}ms`, status: true, result: data };
      const wantsJson = req.query?.format === 'json' || req.headers.accept?.includes('application/json');
      if (wantsJson) return sendJson(res, 200, { ok: true, data: finalPayload });
      const js = buildJsFile(finalPayload, { mode, variableName });
      const fn = buildFilename(v.url, 'scripts');
      res.status(200);
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
      return res.end(js);
    } catch (err) {
      return sendJson(res, 502, { creator: 'FortechDev', time: `${Date.now() - startTime}ms`, status: false, error: normalizeError(err), code: normalizeError(err.code || 'SCRIPTS_FAILED'), attempts: Array.isArray(err.attempts) ? err.attempts.map(a => ({ ...a, error: a.error ? normalizeError(a.error) : null })) : [] });
    }
  }

  const startTime = Date.now();
  try {
    const f = await fetchWithProxyRotation(v.url);
    const parsed = parseHtml(f.html, f.finalUrl || v.url, mode, customSelector);
    const finalPayload = { creator: 'FortechDev', engine: 'fastscrape-axios', time: `${Date.now() - startTime}ms`, status: true, proxyUsed: f.proxyUsed, attempts: f.attempts, result: parsed };
    const wantsJson = req.query?.format === 'json' || req.headers.accept?.includes('application/json');
    if (wantsJson) return sendJson(res, 200, { ok: true, data: finalPayload });
    const js = buildJsFile(finalPayload, { mode, variableName });
    const fn = buildFilename(v.url, mode);
    res.status(200);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    return res.end(js);
  } catch (err) {
    return sendJson(res, 502, { creator: 'FortechDev', time: `${Date.now() - startTime}ms`, status: false, error: normalizeError(err), code: normalizeError(err.code || 'SCRAPE_FAILED'), attempts: Array.isArray(err.attempts) ? err.attempts.map(a => ({ ...a, error: a.error ? normalizeError(a.error) : null })) : [] });
  }
};