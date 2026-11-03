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

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function trunc(s, n) {
    if (!s) return '';
    s = String(s);
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  function setProxyStatus(kind, text) {
    els.proxyStatus.className = 'pill pill-' + kind;
    els.proxyStatusText.textContent = text;
  }

  function setStatus(kind, msg) {
    if (!msg) { els.status.hidden = true; els.status.textContent = ''; els.status.className = 'status'; return; }
    els.status.hidden = false;
    els.status.className = 'status status-' + kind;
    els.status.textContent = msg;
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
    const isCustom = els.modeSelect.value === 'custom';
    els.customWrap.hidden = !isCustom;
    if (isCustom) setTimeout(() => els.customSelector.focus(), 50);
  }

  async function onScrape(e) {
    e.preventDefault();
    setStatus('', '');
    const url = els.urlInput.value.trim();
    if (!url) { setStatus('error', 'URL wajib diisi.'); els.urlInput.focus(); return; }
    const mode = els.modeSelect.value;
    const customSelector = els.customSelector.value.trim();
    if (mode === 'custom' && !customSelector) { setStatus('error', 'CSS Selector wajib untuk mode custom.'); els.customSelector.focus(); return; }
    let variableName = els.variableName.value.trim() || 'scrapedData';
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(variableName)) { setStatus('error', 'Nama variabel harus identifier JS valid.'); els.variableName.focus(); return; }
    lastVariableName = variableName;

    setLoading(true);
    els.resultPanel.hidden = true;

    try {
      const r = await fetch('/api/scrape?format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ url, mode, customSelector, variableName })
      });
      const payload = await r.json().catch(() => null);
      if (!r.ok || !payload || !payload.ok) throw new Error((payload && payload.error) || ('Gagal scrape (HTTP ' + r.status + ')'));
      lastResult = payload.data;
      renderResult(lastResult, mode);
    } catch (err) {
      setStatus('error', (err && err.message) || 'Gagal scrape.');
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
    setTimeout(() => els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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
        (a.error ? '<span class="attempt-error">' + esc(a.error) + '</span>' : '') +
      '</div>'
    ).join('');
    els.attemptsInfo.hidden = false;
    els.attemptsInfo.innerHTML = '<div class="preview-block"><h3>Percobaan</h3>' + rows + '</div>';
  }

  function renderPreview(data, mode) {
    const parts = [renderMetaBlock(data)];
    if (mode === 'all' || mode === 'text') { parts.push(renderHeadingsBlock(data.headings || [])); parts.push(renderParagraphsBlock(data.paragraphs || [])); }
    if (mode === 'all' || mode === 'links') parts.push(renderLinksBlock(data.links || []));
    if (mode === 'all' || mode === 'images') parts.push(renderImagesBlock(data.images || []));
    if (mode === 'all' || mode === 'tables') parts.push(renderTablesBlock(data.tables || []));
    if (mode === 'custom') parts.push(renderCustomBlock(data.custom || []));
    els.preview.innerHTML = parts.filter(Boolean).join('');
  }

  function renderMetaBlock(d) {
    const rows = [['URL', d.url], ['Final URL', d.finalUrl], ['Title', d.title], ['Description', d.description], ['HTTP', d.httpStatus], ['Proxy', d.proxyUsed || 'direct'], ['Waktu', d.scrapedAt]];
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