// Diagnostic-only metadata for MCP smoke failures. Never accept or print
// connector URLs, HTTP response bodies, headers other than content-type, or secrets.
export function formatSelftestHttpFailure({ part, status, contentType, elapsedMs, parseFailure = false }) {
  const mime = (contentType || '').split(';', 1)[0].trim().toLowerCase();
  const responseType = !mime ? 'missing content type'
    : mime === 'application/json' || mime.endsWith('+json') ? 'json response'
    : mime === 'text/html' ? 'html response'
    : mime === 'text/plain' ? 'text response'
    : 'other response';
  const reason = status === 503 ? 'connector unavailable'
    : status === 504 ? 'gateway timeout'
    : status === 502 ? 'gateway error'
    : status === 429 ? 'rate limited'
    : parseFailure ? 'invalid JSON'
    : 'HTTP error';
  const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Math.floor(elapsedMs) : 0;
  const safePart = part === 1 ? 1 : 2;
  return 'selftest part ' + safePart + ' HTTP ' + safeStatus
    + ' (' + reason + '; ' + responseType + '; ' + safeElapsed + 'ms; endpoint redacted)';
}
