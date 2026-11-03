const { getProxyPool } = require('../lib/proxies');
module.exports = function (req, res) {
  res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    service: 'fastscrape',
    time: new Date().toISOString(),
    proxiesLoaded: getProxyPool().size
  }));
};