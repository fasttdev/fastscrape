const cheerio = require('cheerio');

const norm = s => typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
const abs = (base, raw) => { if (!raw) return ''; try { return new URL(raw, base).toString(); } catch { return raw; } };

function parseHtml(html, baseUrl, mode = 'all', customSelector = '') {
  const $ = cheerio.load(html);
  const data = {
    url: baseUrl,
    scrapedAt: new Date().toISOString(),
    title: norm($('title').first().text()) || norm($('meta[property="og:title"]').attr('content')) || '',
    description: norm($('meta[name="description"]').attr('content')) || norm($('meta[property="og:description"]').attr('content')) || ''
  };

  if (mode === 'all' || mode === 'text') {
    const headings = [];
    for (let lv = 1; lv <= 6; lv++) $('h'+lv).each((_, el) => { const t = norm($(el).text()); if (t) headings.push({ level: lv, text: t }); });
    data.headings = headings;
    const paragraphs = [];
    $('p').each((_, el) => { const t = norm($(el).text()); if (t.length >= 3) paragraphs.push(t); });
    data.paragraphs = paragraphs;
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
    const seen = new Set(); const images = [];
    $('img').each((_, el) => {
      const raw = $(el).attr('src') || $(el).attr('data-src') || '';
      const url = abs(baseUrl, raw);
      if (!url || seen.has(url)) return;
      seen.add(url);
      images.push({ url, alt: norm($(el).attr('alt') || ''), width: $(el).attr('width') || null, height: $(el).attr('height') || null });
    });
    data.images = images;
  }

  if (mode === 'all' || mode === 'tables') {
    const tables = [];
    $('table').each((idx, tEl) => {
      const $t = $(tEl);
      const caption = norm($t.find('caption').first().text());
      const headers = [];
      $t.find('thead tr').first().find('th, td').each((_, th) => headers.push(norm($(th).text())));
      if (headers.length === 0) {
        let hasTh = false;
        $t.find('tr').first().find('th').each((_, th) => { hasTh = true; headers.push(norm($(th).text())); });
        if (!hasTh) $t.find('tr').first().find('td').each((_, td) => headers.push(norm($(td).text())));
      }
      const rows = [];
      $t.find('tbody tr').each((_, tr) => { const cells = []; $(tr).find('td, th').each((_, c) => cells.push(norm($(c).text()))); if (cells.length) rows.push(cells); });
      if (rows.length === 0) $t.find('tr').each((ri, tr) => { if (ri === 0) return; const cells = []; $(tr).find('td, th').each((_, c) => cells.push(norm($(c).text()))); if (cells.length) rows.push(cells); });
      if (headers.length || rows.length) tables.push({ index: idx, caption, headers, rows });
    });
    data.tables = tables;
  }

  if (mode === 'custom') {
    data.customSelector = customSelector;
    const results = []; const seen = new Set();
    $(customSelector).each((_, el) => {
      const $el = $(el);
      const item = {
        tag: el.tagName ? el.tagName.toLowerCase() : 'unknown',
        text: norm($el.text()),
        html: $el.html() ? $el.html().trim().slice(0, 2000) : '',
        href: abs(baseUrl, $el.attr('href') || ''),
        src: abs(baseUrl, $el.attr('src') || '')
      };
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

module.exports = { parseHtml };