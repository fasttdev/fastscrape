const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]',
  'metadata.google.internal', '169.254.169.254'
]);

const BLOCKED_PROTOCOLS = new Set([
  'file:', 'ftp:', 'gopher:', 'data:', 'javascript:', 'mailto:'
]);

const PRIVATE_IP_REGEX = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
  /^198\.18\./,
  /^198\.19\./,
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i
];

function isPrivateIp(host) {
  const cleanHost = host.replace(/^\[|\]$/g, '');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanHost) && !cleanHost.includes(':')) {
    return false;
  }
  return PRIVATE_IP_REGEX.some((rx) => rx.test(cleanHost));
}

function validateUrl(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, reason: 'URL kosong atau bukan string' };
  }

  let parsed;
  try {
    parsed = new URL(input.trim());
  } catch (err) {
    return { valid: false, reason: 'Format URL tidak valid' };
  }

  if (BLOCKED_PROTOCOLS.has(parsed.protocol)) {
    return { valid: false, reason: 'Protokol tidak diizinkan' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Hanya http dan https yang diizinkan' };
  }

  const host = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTS.has(host)) {
    return { valid: false, reason: 'Host tidak diizinkan (localhost)' };
  }

  if (isPrivateIp(host)) {
    return { valid: false, reason: 'IP privat tidak diizinkan' };
  }

  if (!host.includes('.') && !host.includes(':')) {
    return { valid: false, reason: 'Host tidak valid' };
  }

  return { valid: true, url: parsed.toString() };
}

module.exports = { validateUrl };