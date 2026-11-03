const { validateUrl } = require('../lib/urlValidator');
const { fetchWithProxyRotation } = require('../lib/scraper');
const { parseHtml } = require('../lib/parser');
const { buildJsFile, buildDownloadFilename } = require('../lib/jsExporter');
const { rateLimit } = require('../lib/rateLimit');
const { getProxyPool } = require('../lib/proxies');

const VALID_MODES = new Set(['all','text','links','images','tables','custom']);

function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1000000) { reject(new Error('Body terlalu besar')); req.destroy(); } });
    req.on('end', () => { if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch { reject(new Error('Body bukan JSON valid')); } });
    req.on('error', reject);
  });
}

// FIX: pastikan semua pesan error jadi string
function normalizeError(err) {
  if (!err) return 'Terjadi kesalahan.';
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string') return err.message;
  if (typeof err.reason === 'string') return err.reason;
  try { return JSON.stringify(err); } catch { return 'Terjadi kesalahan.'; }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, 200, { ok: true, message: 'Endpoint scrape aktif. Gunakan POST.', proxiesLoaded: getProxyPool().size });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method tidak diizinkan' });

  const limit = rateLimit(req);
  if (!limit.allowed) {
    res.setHeader('Retry-After', Math.ceil((limit.resetAt - Date.now()) / 1000));
    return sendJson(res, 429, { ok: false, error: 'Terlalu banyak permintaan' });
  }

  let body;
  try { body = await readJson(req); } catch (err) { return sendJson(res, 400, { ok: false, error: normalizeError(err) }); }

  const { url, mode = 'all', customSelector = '', variableName = 'scrapedData' } = body || {};
  if (!VALID_MODES.has(mode)) return sendJson(res, 400, { ok: false, error: 'Mode tidak valid' });
  if (mode === 'custom' && !customSelector) return sendJson(res, 400, { ok: false, error: 'customSelector wajib untuk mode custom' });

  const v = validateUrl(url);
  if (!v.valid) return sendJson(res, 400, { ok: false, error: normalizeError(v.reason) });

  try {
    const f = await fetchWithProxyRotation(v.url);
    const parsed = parseHtml(f.html, f.finalUrl || v.url, mode, customSelector);
    parsed.proxyUsed = f.proxyUsed;
    parsed.httpStatus = f.status;
    parsed.finalUrl = f.finalUrl;
    parsed.attempts = f.attempts;

    const wantsJson = req.query?.format === 'json' || req.headers.accept?.includes('application/json');
    if (wantsJson) return sendJson(res, 200, { ok: true, data: parsed });

    const js = buildJsFile(parsed, { mode, variableName });
    const fn = buildDownloadFilename(v.url, mode);
    res.status(200);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.setHeader('X-Scrape-Proxy', String(f.proxyUsed || 'direct'));
    res.setHeader('X-Scrape-Status', String(f.status));
    return res.end(js);
  } catch (err) {
    return sendJson(res, 502, {
      ok: false,
      error: normalizeError(err),          // <-- FIX: dijamin string
      code: normalizeError(err.code || 'SCRAPE_FAILED'),
      attempts: Array.isArray(err.attempts) ? err.attempts.map(a => ({
        ...a,
        error: a.error ? normalizeError(a.error) : null
      })) : []
    });
  }
};