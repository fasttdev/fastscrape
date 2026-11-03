(function () {
  'use strict';

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
    proxyStatus: document.getElementById('proxyStatus'),
    proxyStatusText: document.getElementById('proxyStatusText')
  };

  let lastResult = null;
  let lastVariableName = 'scrapedData';
  let lastFilename = 'scrape.js';
  let lastMode = 'all';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function trunc(s, n) {
    if (!s) return '';
    s = String(s);
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  function formatBytes(b) {
    if (!b || b < 0) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
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

  function setProxyStatus(kind, text) {
    els.proxyStatus.className = 'pill pill-' + kind;
    els.proxyStatusText.textContent = text;
  }

  function setStatus(kind, msg) {
    if (!msg) { els.status.hidden = true; els.status.textContent = ''; els.status.className = 'status'; return; }
    els.status.hidden = false;
    els.status.className = 'status status-' + kind;
    els.status.textContent = safeMessage(msg);
  }

  function setLoading(on) {
    els.submitBtn.disabled = on;
    els.submitBtn.classList.toggle('is-loading', on);
    els.submitText.textContent = on ? 'Scraping...' : 'Scrape Sekarang';
    if (on) { els.downloadBtn.disabled = true; els.copyJsonBtn.disabled = true; }
  }

  async function checkHealth() {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const n = d.proxiesLoaded || 0;
      setProxyStatus(n === 0 ? 'warn' : 'ok', 'Proxy: ' + n);
    } catch { setProxyStatus('error', 'Server offline'); }
  }

  function onModeChange() {
    const v = els.modeSelect.value;
    els.customWrap.hidden = v !== 'custom';
    if (v === 'custom') setTimeout(() => els.customSelector.focus(), 50);
  }

  async function onScrape(e) {
    e.preventDefault();
    setStatus('', '');

    const url = els.urlInput.value.trim();
    if (!url) { setStatus('error', 'URL wajib diisi.'); els.urlInput.focus(); return; }

    const mode = els.modeSelect.value;
    const customSelector = els.customSelector.value.trim();
    if (mode === 'custom' && !customSelector) {
      setStatus('error', 'CSS Selector wajib untuk mode custom.');
      els.customSelector.focus();
      return;
    }

    let variableName = els.variableName.value.trim() || 'scrapedData';
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(variableName)) {
      setStatus('error', 'Nama variabel harus identifier JS yang valid.');
      els.variableName.focus();
      return;
    }
    lastVariableName = variableName;
    lastMode = mode;

    setLoading(true);
    els.resultPanel.hidden = true;

    try {
      if (mode === 'mirror') {
        const r = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, mode, customSelector, variableName })
        });
        if (!r.ok) {
          const payload = await r.json().catch(() => null);
          throw new Error(safeMessage(payload && payload.error) || 'Gagal mirror (HTTP ' + r.status + ')');
        }
        const html = await r.text();
        lastResult = { mirrorUrl: URL.createObjectURL(new Blob([html], { type: 'text/html' })) };
        lastFilename = buildFilename(url, 'mirror').replace(/\.js$/, '.html');

        els.statsRow.innerHTML = '';
        els.attemptsInfo.hidden = true;
        els.attemptsInfo.innerHTML = '';
        els.preview.innerHTML =
          '<div class="preview-block" style="border-left:4px solid #10b981;">' +
            '<h3 style="color:#10b981;">✅ Mirror Siap</h3>' +
            '<div class="preview-item">' + html.length.toLocaleString() + ' bytes HTML. Klik tombol di bawah untuk buka di tab baru.</div>' +
            '<div class="preview-item" style="background:rgba(239,68,68,0.1);color:#b91c1c;">Fitur yang manggil API server (login, download, submit form) tetap nggak jalan. Cuma UI + JS client-side yang aktif.</div>' +
          '</div>';

        els.resultBadge.textContent = 'MIRROR';
        els.resultBadge.className = 'panel-badge panel-badge-ok';
        els.downloadBtn.textContent = 'Buka Mirror';
        els.downloadBtn.disabled = false;
        els.copyJsonBtn.disabled = true;
        els.resultPanel.hidden = false;
        setTimeout(() => els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        return;
      }

      const r = await fetch('/api/scrape?format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url, mode, customSelector, variableName })
      });
      const payload = await r.json().catch(() => null);
      if (!r.ok || !payload || !payload.ok) {
        const msg = safeMessage(payload && payload.error) || ('Gagal scrape (HTTP ' + r.status + ')');
        throw new Error(msg);
      }
      lastResult = payload.data;
      els.downloadBtn.textContent = 'Download .js';
      els.copyJsonBtn.disabled = false;
      renderResult(lastResult, mode);
    } catch (err) {
      setStatus('error', safeMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function renderResult(payload, mode) {
    const data = payload.result || payload;

    lastFilename = buildFilename(data.url || '', mode);
    renderStats(mode === 'scripts' ? (data.stats || {}) : (data.stats || {}));
    renderAttempts(payload.attempts || data.attempts || []);

    let engineInfo = '';
    if (payload.time || payload.engine) {
      engineInfo = '<div class="preview-block" style="background:rgba(96,165,250,0.1);"><h3>Engine Info</h3><div class="kv">' +
        '<div class="kv-row"><span>Engine</span><span>' + esc(payload.engine || 'unknown') + '</span></div>' +
        '<div class="kv-row"><span>Waktu Scrape</span><span>' + esc(payload.time || '-') + '</span></div>' +
        '</div></div>';
    }

    if (mode === 'scripts') {
      els.preview.innerHTML = engineInfo + renderScriptsPreview(data);
    } else {
      els.preview.innerHTML = engineInfo + renderPreviewHTML(data, mode);
    }

    els.resultBadge.textContent = mode === 'scripts' ? 'SCRIPTS' : 'OK';
    els.resultBadge.className = 'panel-badge panel-badge-ok';
    els.downloadBtn.disabled = false;
    els.copyJsonBtn.disabled = false;
    els.resultPanel.hidden = false;
    setTimeout(() => { els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  }

  function renderStats(s) {
    const items = [['Heading', s.headings], ['Paragraf', s.paragraphs], ['Link', s.links], ['Gambar', s.images], ['Tabel', s.tables], ['Custom', s.custom]]
      .filter(p => typeof p[1] === 'number' && p[1] > 0);
    if (!items.length) { els.statsRow.innerHTML = ''; return; }
    els.statsRow.innerHTML = items.map(p =>
      '<div class="stat-chip"><span class="stat-value">' + p[1] + '</span><span class="stat-label">' + esc(p[0]) + '</span></div>'
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

  // === PREVIEW UNTUK MODE SCRIPTS ===
  function renderScriptsPreview(data) {
    if (!data || !data.scripts || !data.scripts.length) {
      return '<div class="preview-block"><h3>Scripts</h3><div class="preview-more">Tidak ada tag &lt;script&gt; ditemukan.</div></div>';
    }

    let html = '<div class="preview-block"><h3>Ringkasan Scripts</h3><div class="kv">' +
      '<div class="kv-row"><span>Total</span><span>' + data.totalScripts + '</span></div>' +
      '<div class="kv-row"><span>Inline</span><span>' + data.inlineCount + '</span></div>' +
      '<div class="kv-row"><span>Eksternal</span><span>' + data.externalCount + '</span></div>' +
      '<div class="kv-row"><span>Gagal Fetch</span><span>' + data.failedCount + '</span></div>' +
      '<div class="kv-row"><span>Di-skip</span><span>' + (data.skippedCount || 0) + '</span></div>' +
      '</div></div>';

    html += '<div class="preview-block"><h3>Daftar Scripts</h3><div class="preview-list">';

    data.scripts.forEach((s, i) => {
      const badge = s.type === 'inline' ? 'INLINE' : 'EXT';
      const statusIcon = s.error ? '❌' : (s.skipped ? '⏭️' : '✅');
      const sizeText = s.size ? formatBytes(s.size) : '-';
      let item = '<div class="preview-item">';
      item += '<div style="margin-bottom:4px;"><span class="preview-label">#' + (i + 1) + ' ' + badge + '</span> ' + statusIcon + ' ' + sizeText + '</div>';
      if (s.src) {
        item += '<div style="font-size:11px;color:var(--gray-600);word-break:break-all;margin-bottom:4px;">' + esc(s.src) + '</div>';
      }
      if (s.error) {
        item += '<div style="color:#b91c1c;font-size:11px;font-weight:600;">Error: ' + esc(safeMessage(s.error)) + '</div>';
      } else if (s.skipped) {
        item += '<div style="color:#f59e0b;font-size:11px;font-weight:600;">' + esc(s.reason || 'Di-skip') + '</div>';
      } else if (s.code) {
        const snippet = s.code.substring(0, 200).replace(/\n/g, ' ');
        item += '<div style="font-family:monospace;font-size:10px;color:var(--gray-700);background:rgba(0,0,0,0.04);padding:6px;border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(snippet) + '</div>';
      }
      item += '</div>';
      html += item;
    });

    html += '</div></div>';
    html += '<div class="preview-block" style="background:rgba(96,165,250,0.1);"><h3>ℹ️ Info</h3>' +
      '<div class="preview-item" style="font-size:12px;">Klik <b>Download .js</b> untuk mengunduh bundle berisi kode semua script. Bundle berisi array string — lu bisa iterasi dan simpan per-file: <code>scripts.forEach((s, i) => fs.writeFileSync("js_" + i + ".js", s.code))</code></div>' +
      '</div>';

    return html;
  }

  function renderPreviewHTML(data, mode) {
    const parts = [];
    if (data._warning) {
      parts.push('<div class="preview-block" style="border-left:4px solid #f59e0b;"><h3 style="color:#f59e0b;">⚠️ Peringatan</h3><div class="preview-item" style="background:rgba(245,158,11,0.1);">' + esc(data._warning) + '</div></div>');
    }
    if (data.rawText && data.rawText.length > 0) {
      parts.push('<div class="preview-block"><h3>Raw Text (' + data.rawText.length + ' karakter)</h3><div class="preview-item" style="max-height:200px;overflow-y:auto;">' + esc(trunc(data.rawText, 1000)) + '</div></div>');
    }
    parts.push(renderMetaBlock(data));
    if (data.meta && (data.meta.og || data.meta.twitter)) parts.push(renderSEOMetaBlock(data.meta));
    if (data.structuredData && data.structuredData.length > 0) parts.push(renderStructuredData(data.structuredData));

    if (mode === 'all' || mode === 'text') {
      parts.push(renderHeadingsBlock(data.headings || []));
      parts.push(renderParagraphsBlock(data.paragraphs || []));
    }
    if (mode === 'all' || mode === 'links') parts.push(renderLinksBlock(data.links || []));
    if (mode === 'all' || mode === 'images') parts.push(renderImagesBlock(data.images || []));
    if (mode === 'all' || mode === 'tables') parts.push(renderTablesBlock(data.tables || []));
    if (mode === 'custom') parts.push(renderCustomBlock(data.custom || []));

    return parts.filter(Boolean).join('');
  }

  function renderMetaBlock(d) {
    const rows = [
      ['URL', d.url],
      ['Title', d.title || (d.meta && d.meta.title)],
      ['Description', d.description || (d.meta && d.meta.description)],
      ['Domain', d.domain],
      ['HTTP', d.httpStatus],
      ['Proxy', d.proxyUsed || 'direct'],
      ['Waktu', d.scrapedAt]
    ];
    return '<div class="preview-block"><h3>Informasi Dasar</h3><div class="kv">' +
      rows.map(r => '<div class="kv-row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1] || '-') + '</span></div>').join('') +
      '</div></div>';
  }

  function renderSEOMetaBlock(meta) {
    let rows = [];
    if (meta.og && meta.og.title) {
      rows.push('<div class="kv-row"><span>OG Title</span><span>' + esc(meta.og.title) + '</span></div>');
      rows.push('<div class="kv-row"><span>OG Image</span><span style="word-break:break-all">' + esc(meta.og.image) + '</span></div>');
    }
    if (meta.keywords) rows.push('<div class="kv-row"><span>Keywords</span><span>' + esc(meta.keywords) + '</span></div>');
    if (meta.author) rows.push('<div class="kv-row"><span>Author</span><span>' + esc(meta.author) + '</span></div>');
    if (meta.generator) rows.push('<div class="kv-row"><span>Generator</span><span>' + esc(meta.generator) + '</span></div>');
    if (rows.length === 0) return '';
    return '<div class="preview-block"><h3>SEO &amp; OpenGraph Meta</h3><div class="kv">' + rows.join('') + '</div></div>';
  }

  function renderStructuredData(ldData) {
    return '<div class="preview-block"><h3>Structured Data (JSON-LD)</h3><div class="preview-list">' +
      ldData.slice(0, 3).map(ld => '<div class="preview-item"><pre style="margin:0;font-size:10px;overflow-x:auto;">' + esc(trunc(JSON.stringify(ld, null, 2), 500)) + '</pre></div>').join('') +
      (ldData.length > 3 ? '<div class="preview-more">+' + (ldData.length - 3) + ' data lainnya</div>' : '') +
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
    const header = '// Generated by FASTSCRAPE\n// Source URL: ' + (data.result?.url || data.url || '') + '\n// Scraped at: ' + new Date().toISOString() + '\n\n';
    const body = 'const ' + varName + ' = ' + JSON.stringify(data, null, 2) + ';\n';
    const footer = '\nif (typeof module !== "undefined" && module.exports) {\n  module.exports = ' + varName + ';\n}\n';
    return header + body + footer;
  }

  function onDownload() {
    if (!lastResult) return;

    if (lastResult.mirrorUrl) {
      window.open(lastResult.mirrorUrl, '_blank');
      return;
    }

    const content = buildJsFile(lastResult, lastVariableName, lastMode);
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
      try { document.execCommand('copy'); setStatus('success', 'JSON disalin.'); } catch { setStatus('error', 'Gagal menyalin.'); }
      document.body.removeChild(ta);
      setTimeout(() => setStatus('', ''), 2500);
    }
  }

  els.form.addEventListener('submit', onScrape);
  els.modeSelect.addEventListener('change', onModeChange);
  els.downloadBtn.addEventListener('click', onDownload);
  els.copyJsonBtn.addEventListener('click', onCopy);
  onModeChange();
  checkHealth();
})();