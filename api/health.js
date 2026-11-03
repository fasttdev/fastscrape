module.exports = function handler(req, res) {
  res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    service: 'fastscrape',
    time: new Date().toISOString(),
    proxiesLoaded: (process.env.PROXY_LIST || '').split(/\r?\n/).filter(Boolean).length
  }));
};