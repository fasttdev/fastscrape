const WINDOW_MS = 60000;
const MAX = 30;
const buckets = new Map();

function getKey(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req) {
  const key = getKey(req);
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start >= WINDOW_MS) { b = { start: now, count: 0 }; buckets.set(key, b); }
  b.count += 1;
  if (buckets.size > 2000) for (const [k, v] of buckets) if (now - v.start >= WINDOW_MS) buckets.delete(k);
  return { allowed: b.count <= MAX, remaining: Math.max(0, MAX - b.count), resetAt: b.start + WINDOW_MS };
}

module.exports = { rateLimit, MAX_REQUESTS: MAX, WINDOW_MS };