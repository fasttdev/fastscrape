(function () {
  'use strict';

  // ============================================================
  // KONFIGURASI CORS PROXY (fallback berurutan)
  // Kalau satu mati, coba yang berikutnya.
  // ============================================================
  const CORS_PROXIES = [
    { name: 'allorigins',  build: u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
    { name: 'corsproxy',   build: u => 'https://corsproxy.io/?' + encodeURIComponent(u) },
    { name: 'thingproxy',  build: u => 'https://thingproxy.freeboard.io/fetch/' + u }
  ];

  const els = {
    form: document.getElementById('scrapeForm'),
    urlInput: document.getElementById('urlInput'),
    modeSelect: document.getElementById('modeSelect'),
    customWrap: document.getElementById('customWrap'),
    customSelector: document.getElementById('customSelector'),
    variableName: document.getElementById('variableName'),
    submitBtn: document.getElementById('submitBtn'),
    submitText: document.getElementById('submitText'),
    status: document.getElementById('status'),
    resultPanel: document.getElementById('resultPanel'),
    resultBadge: document.getElementById('resultBadge'),
    statsRow: document.getElementById('statsRow'),
    attemptsInfo: document.getElementById('attemptsInfo'),
    preview: document.getElementById('preview'),
    downloadBtn: document.getElementById('downloadBtn'),
    copyJsonBtn: document.getElementById('copyJsonBtn'),
    netStatus: document.getElementById('netStatus'),
    netStatusText: document.getElementById('netStatusText')
  };

  let lastResult = null;
  let lastVariableName = 'scrapedData';
  let lastFilename = 'scrape.js';

  // ---------- utils ----------

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function trunc(s, n) {
    if (!s) return '';
    s = String(s);
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  function norm(s) {
    return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
  }

  function abs(base, raw) {
    if (!raw) return '';
    try { return new URL(raw, base).toString(); } catch { return raw; }
  }

  function safeMessage(input) {
    if (input === null || input === undefined) return 'Terjadi kesalahan.';
    if (typeof input === 'string') return input;
    if (input instanceof Error) return input.message || 'Terjadi kesalahan.';
    if (typeof input === 'object') {
      if (typeof input.message === 'string') return input.message;
      if (typeof input.error === 'string') return input.error;
      try { return JSON.stringify(input); } catch { return 'Terjadi kesalahan.'; }
    }
    return String(input);
  }

  // ---------- status UI ----------

  function setNetStatus(kind, text) {
    els.netStatus.className = 'pill pill-' + kind;
    els.netStatusText.textContent = text;
  }

  function setStatus(kind, msg) {
    if (!msg) {
      els.status.hidden = true;
      els.status.textContent = '';
      els.status.className = 'status';
      return;
    }
    els.status.hidden = false;
    els.status.className = 'status status-' + kind;
    els.status.textContent = safeMessage(msg);
  }

  function setLoading(on) {
    els.submitBtn.disabled = on;
    els.submitBtn.classList.toggle('is-loading', on);
    els.submitText.textContent = on ? 'Scraping...' : 'Scrape Sekarang';
    if (on) {
      els.downloadBtn.disabled = true;
      els.copyJsonBtn.disabled = true;
    }
  }

  // ---------- CORS proxy fetch ----------

  async function fetchWithFallback(targetUrl) {
    const attempts = [];
    for (const p of CORS_PROXIES) {
      const t0 = Date.now();
      const proxied = p.build(targetUrl);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(proxied, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'text/html,*/*' }
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const html = await res.text();
        if (!html || html.length < 30) throw new Error('Respons kosong');
        attempts.push({ proxy: p.name, ok: true, durationMs: Date.now() - t0 });
        return { html, proxyUsed: p.name, attempts };
      } catch (err) {
        attempts.push({
          proxy: p.name,
          ok: false,
          durationMs: Date.now() - t0,
          error: safeMessage(err.name === 'AbortError' ? 'timeout' : err)
        });
      }
    }
    const e = new Error('Semua CORS proxy gagal. Situs mungkin memblokir atau proxy sedang down.');
    e.attempts = attempts;
    throw e;
  }

  // ---------- parser ----------

  function parseHtml(html, baseUrl, mode, customSelector) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const title = norm(doc.title) ||
      norm(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')) || '';

    const description =
      norm(doc.querySelector('meta[name="description"]')?.getAttribute('content')) ||
      norm(doc.querySelector('meta[property="og:description"]')?.getAttribute('content')) || '';

    const data = {
      url: baseUrl,
      scrapedAt: new Date().toISOString(),
      title,
      description
    };

    if (mode === 'all' || mode === 'text') {
      const headings = [];
      for (let lv = 1; lv <= 6; lv++) {
        doc.querySelectorAll('h' + lv).forEach(el => {
          const t = norm(el.textContent);
          if (t) headings.push({ level: lv, text: t });
        });
      }
      data.headings = headings;

      const paragraphs = [];
      doc.querySelectorAll('p').forEach(el => {
        const t = norm(el.textContent);
        if (t.length >= 3) paragraphs.push(t);
      });
      data.paragraphs = paragraphs;
    }

    if (mode === 'all' || mode === 'links') {
      const seen = new Set();
      const links = [];
      doc.querySelectorAll('a[href]').forEach(el => {
        const url = abs(baseUrl, el.getAttribute('href'));
        if (!url || seen.has(url)) return;
        seen.add(url);
        links.push({
          url,
          text: norm(el.textContent),
          rel: norm(el.getAttribute('rel') || ''),
          target: norm(el.getAttribute('target') || '')
        });
      });
      data.links = links;
    }

    if (mode === 'all' || mode === 'images') {
      const seen = new Set();
      const images = [];
      doc.querySelectorAll('img').forEach(el => {
        const raw = el.getAttribute('src') || el.getAttribute('data-src') || '';
        const url = abs(baseUrl, raw);
        if (!url || seen.has(url)) return;
        seen.add(url);
        images.push({
          url,
          alt: norm(el.getAttribute('alt') || ''),
          width: el.getAttribute('width') || null,
          height: el.getAttribute('height') || null
        });
      });
      data.images = images;
    }

    if (mode === 'all' || mode === 'tables') {
      const tables = [];
      doc.querySelectorAll('table').forEach((tableEl, idx) => {
        const caption = norm(tableEl.querySelector('caption')?.textContent || '');
        const headers = [];
        tableEl.querySelectorAll('thead tr').forEach((tr, i) => {
          if (i > 0) return;
          tr.querySelectorAll('th, td').forEach(th => headers.push(norm(th.textContent)));
        });
        if (headers.length === 0) {
          const firstRow = tableEl.querySelector('tr');
          if (firstRow) {
            let hasTh = false;
            firstRow.querySelectorAll('th').forEach(th => {
              hasTh = true;
              headers.push(norm(th.textContent));
            });
            if (!hasTh) {
              firstRow.querySelectorAll('td').forEach(td => headers.push(norm(td.textContent)));
            }
          }
        }
        const rows = [];
        tableEl.querySelectorAll('tbody tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('td, th').forEach(c => cells.push(norm(c.textContent)));
          if (cells.length) rows.push(cells);
        });
        if (rows.length === 0) {
          tableEl.querySelectorAll('tr').forEach((tr, ri) => {
            if (ri === 0) return;
            const cells = [];
            tr.querySelectorAll('td, th').forEach(c => cells.push(norm(c.textContent)));
            if (cells.length) rows.push(cells);
          });
        }
        if (headers.length || rows.length) {
          tables.push({ index: idx, caption, headers, rows });
        }
      });
      data.tables = tables;
    }

    if (mode === 'custom') {
      data.customSelector = customSelector;
      const results = [];
      const seen = new Set();
      let selected = [];
      try {
        selected = Array.from(doc.querySelectorAll(customSelector));
      } catch (err) {
        throw new Error('CSS Selector tidak valid: ' + err.message);
      }
      selected.forEach(el => {
        const item = {
          tag: el.tagName ? el.tagName.toLowerCase() : 'unknown',
          text: norm(el.textContent),
          html: el.innerHTML ? el.innerHTML.trim().slice(0, 2000) : '',
          href: abs(baseUrl, el.getAttribute('href') || ''),
          src: abs(baseUrl, el.getAttribute('src') || '')
        };
        const k = item.tag + '|' + item.text.slice(0, 80) + '|' + item.href + '|' + item.src;
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

  // ---------- actions ----------

  function onModeChange() {
    const isCustom = els.modeSelect.value === 'custom';
    els.customWrap.hidden = !isCustom;
    if (isCustom) setTimeout(() => els.customSelector.focus(), 50);
  }

  async function onScrape(e) {
    e.preventDefault();
    setStatus('', '');

    const url = els.urlInput.value.trim();
    if (!url) { setStatus('error', 'URL wajib diisi.'); els.urlInput.focus(); return; }

    let parsed;
    try { parsed = new URL(url); } catch { setStatus('error', 'Format URL tidak valid.'); els.urlInput.focus(); return; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setStatus('error', 'Hanya http/https yang diizinkan.'); return;
    }

    const mode = els.modeSelect.value;
    const customSelector = els.customSelector.value.trim();
    if (mode === 'custom' && !customSelector) {
      setStatus('error', 'CSS Selector wajib untuk mode custom.'); els.customSelector.focus(); return;
    }

    let variableName = els.variableName.value.trim() || 'scrapedData';
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(variableName)) {
      setStatus('error', 'Nama variabel harus identifier JS valid.'); els.variableName.focus(); return;
    }
    lastVariableName = variableName;

    setLoading(true);
    els.resultPanel.hidden = true;
    setNetStatus('loading', 'Scraping...');

    try {
      const fetched = await fetchWithFallback(url);
      const data = parseHtml(fetched.html, url, mode, customSelector);
      data.proxyUsed = fetched.proxyUsed;
      data.attempts = fetched.attempts;

      lastResult = data;
      renderResult(data, mode);
      setNetStatus('ok', 'OK: ' + fetched.proxyUsed);
    } catch (err) {
      setStatus('error', safeMessage(err));
      setNetStatus('error', 'Gagal');
      if (err.attempts) renderAttempts(err.attempts);
    } finally {
      setLoading(false);
    }
  }

  function renderResult(data, mode) {
    lastFilename = buildFilename(data.url || '', mode);
    renderStats(data.stats || {});
    renderAttempts(data.attempts || []);
    renderPreview(data, mode);

    els.resultBadge.textContent = 'OK';
    els.resultBadge.className = 'panel-badge panel-badge-ok';
    els.downloadBtn.disabled = false;
    els.copyJsonBtn.disabled = false;
    els.resultPanel.hidden = false;

    setTimeout(() => {
      els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function renderStats(s) {
    const items = [
      ['Heading', s.headings],
      ['Paragraf', s.paragraphs],
      ['Link', s.links],
      ['Gambar', s.images],
      ['Tabel', s.tables],
      ['Custom', s.custom]
    ].filter(p => typeof p[1] === 'number' && p[1] > 0);

    if (!items.length) { els.statsRow.innerHTML = ''; return; }

    els.statsRow.innerHTML = items.map(p =>
      '<div class="stat-chip">' +
        '<span class="stat-value">' + p[1] + '</span>' +
        '<span class="stat-label">' + esc(p[0]) + '</span>' +
      '</div>'
    ).join('');
  }

  function renderAttempts(attempts) {
    if (!attempts || !attempts.length) { els.attemptsInfo.hidden = true; els.attemptsInfo.innerHTML = ''; return; }
    const rows = attempts.map(a =>
      '<div class="attempt-row ' + (a.ok ? 'ok' : 'fail') + '">' +
        '<span>' + (a.ok ? '✓' : '✗') + '</span>' +
        '<span>' + esc(a.proxy || '-') + '</span>' +
        '<span>' + (a.durationMs || 0) + 'ms</span>' +
        (a.error ? '<span class="attempt-error">' + esc(safeMessage(a.error)) + '</span>' : '') +
      '</div>'
    ).join('');
    els.attemptsInfo.hidden = false;
    els.attemptsInfo.innerHTML = '<div class="preview-block"><h3>Percobaan</h3>' + rows + '</div>';
  }

  function renderPreview(data, mode) {
    const parts = [renderMetaBlock(data)];
    if (mode === 'all' || mode === 'text') {
      parts.push(renderHeadingsBlock(data.headings || []));
      parts.push(renderParagraphsBlock(data.paragraphs || []));
    }
    if (mode === 'all' || mode === 'links') parts.push(renderLinksBlock(data.links || []));
    if (mode === 'all' || mode === 'images') parts.push(renderImagesBlock(data.images || []));
    if (mode === 'all' || mode === 'tables') parts.push(renderTablesBlock(data.tables || []));
    if (mode === 'custom') parts.push(renderCustomBlock(data.custom || []));
    els.preview.innerHTML = parts.filter(Boolean).join('');
  }

  function renderMetaBlock(d) {
    const rows = [
      ['URL', d.url],
      ['Title', d.title],
      ['Description', d.description],
      ['Proxy', d.proxyUsed || '-'],
      ['Waktu', d.scrapedAt]
    ];
    return '<div class="preview-block"><h3>Meta</h3><div class="kv">' +
      rows.map(r => '<div class="kv-row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1] || '-') + '</span></div>').join('') +
      '</div></div>';
  }

  function renderHeadingsBlock(hs) {
    if (!hs.length) return '';
    const sample = hs.slice(0, 10);
    return '<div class="preview-block"><h3>Heading (' + hs.length + ')</h3><div class="preview-list">' +
      sample.map(h => '<div class="preview-item"><span class="preview-label">H' + h.level + '</span>' + esc(trunc(h.text, 160)) + '</div>').join('') +
      (hs.length > sample.length ? '<div class="preview-more">+' + (hs.length - sample.length) + ' heading lainnya</div>' : '') +
      '</div></div>';
  }

  function renderParagraphsBlock(ps) {
    if (!ps.length) return '';
    const sample = ps.slice(0, 6);
    return '<div class="preview-block"><h3>Paragraf (' + ps.length + ')</h3><div class="preview-list">' +
      sample.map(p => '<div class="preview-item">' + esc(trunc(p, 220)) + '</div>').join('') +
      (ps.length > sample.length ? '<div class="preview-more">+' + (ps.length - sample.length) + ' paragraf lainnya</div>' : '') +
      '</div></div>';
  }

  function renderLinksBlock(ls) {
    if (!ls.length) return '';
    const sample = ls.slice(0, 10);
    return '<div class="preview-block"><h3>Link (' + ls.length + ')</h3><div class="preview-list">' +
      sample.map(l => '<div class="preview-item"><span class="preview-label">A</span>' + esc(l.text ? trunc(l.text, 60) : '(tanpa teks)') + ' — <span style="color:var(--gray-600);word-break:break-all">' + esc(trunc(l.url, 120)) + '</span></div>').join('') +
      (ls.length > sample.length ? '<div class="preview-more">+' + (ls.length - sample.length) + ' link lainnya</div>' : '') +
      '</div></div>';
  }

  function renderImagesBlock(ims) {
    if (!ims.length) return '';
    const sample = ims.slice(0, 10);
    return '<div class="preview-block"><h3>Gambar (' + ims.length + ')</h3><div class="preview-list">' +
      sample.map(i => '<div class="preview-item"><span class="preview-label">IMG</span>' + esc(i.alt || '(tanpa alt)') + ' — <span style="color:var(--gray-600);word-break:break-all">' + esc(trunc(i.url, 120)) + '</span></div>').join('') +
      (ims.length > sample.length ? '<div class="preview-more">+' + (ims.length - sample.length) + ' gambar lainnya</div>' : '') +
      '</div></div>';
  }

  function renderTablesBlock(ts) {
    if (!ts.length) return '';
    return '<div class="preview-block"><h3>Tabel (' + ts.length + ')</h3><div class="preview-list">' +
      ts.slice(0, 5).map(t => '<div class="preview-item">Tabel #' + (t.index + 1) + (t.caption ? ' — ' + esc(trunc(t.caption, 60)) : '') + ' · ' + t.rows.length + ' baris · ' + t.headers.length + ' kolom</div>').join('') +
      (ts.length > 5 ? '<div class="preview-more">+' + (ts.length - 5) + ' tabel lainnya</div>' : '') +
      '</div></div>';
  }

  function renderCustomBlock(cs) {
    if (!cs.length) return '<div class="preview-block"><h3>Custom</h3><div class="preview-more">Tidak ada elemen cocok.</div></div>';
    return '<div class="preview-block"><h3>Custom (' + cs.length + ')</h3><div class="preview-list">' +
      cs.slice(0, 10).map(c => '<div class="preview-item"><span class="preview-label">' + esc(c.tag) + '</span>' + esc(trunc(c.text, 160)) + '</div>').join('') +
      (cs.length > 10 ? '<div class="preview-more">+' + (cs.length - 10) + ' lainnya</div>' : '') +
      '</div></div>';
  }

  function buildFilename(url, mode) {
    let host = 'scrape';
    try { host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_'); } catch {}
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return host + '_' + String(mode || 'all').replace(/[^a-z0-9]/gi, '') + '_' + ts + '.js';
  }

  function buildJsFile(data, varName, mode) {
    const header = '// Generated by FASTSCRAPE\n// Source URL: ' + (data.url || '') + '\n// Scraped at: ' + (data.scrapedAt || '') + '\n// Mode: ' + mode + '\n\n';
    const body = 'const ' + varName + ' = ' + JSON.stringify(data, null, 2) + ';\n';
    const footer = '\nif (typeof module !== "undefined" && module.exports) {\n  module.exports = ' + varName + ';\n}\n';
    return header + body + footer;
  }

  function onDownload() {
    if (!lastResult) return;
    const content = buildJsFile(lastResult, lastVariableName, els.modeSelect.value);
    const blob = new Blob([content], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lastFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onCopy() {
    if (!lastResult) return;
    const txt = JSON.stringify(lastResult, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      setStatus('success', 'JSON disalin ke clipboard.');
      setTimeout(() => setStatus('', ''), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); setStatus('success', 'JSON disalin.'); }
      catch { setStatus('error', 'Gagal menyalin.'); }
      document.body.removeChild(ta);
      setTimeout(() => setStatus('', ''), 2500);
    }
  }

  els.form.addEventListener('submit', onScrape);
  els.modeSelect.addEventListener('change', onModeChange);
  els.downloadBtn.addEventListener('click', onDownload);
  els.copyJsonBtn.addEventListener('click', onCopy);

  onModeChange();
  setNetStatus('ok', 'Static mode');
})();