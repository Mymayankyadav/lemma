import { describe, expect, it } from 'vitest';
import { formatSelftestHttpFailure } from './smoke-diagnostics.mjs';

describe('MCP smoke HTTP failure diagnostics', () => {
  it('reports status, safe category, response type and elapsed time without credentials', () => {
    const message = formatSelftestHttpFailure({
      part: 2, status: 503, contentType: 'application/json; charset=utf-8',
      elapsedMs: 78918,
    });
    expect(message).toBe('selftest part 2 HTTP 503 (connector unavailable; json response; 78918ms; endpoint redacted)');
  });

  it('distinguishes an HTML gateway timeout from an application JSON error', () => {
    expect(formatSelftestHttpFailure({
      part: 2, status: 504, contentType: 'text/html', elapsedMs: 140000,
    })).toBe('selftest part 2 HTTP 504 (gateway timeout; html response; 140000ms; endpoint redacted)');
  });

  it('reports invalid JSON on a nominally successful response', () => {
    expect(formatSelftestHttpFailure({
      part: 1, status: 200, contentType: 'text/plain', elapsedMs: 120,
      parseFailure: true,
    })).toBe('selftest part 1 HTTP 200 (invalid JSON; text response; 120ms; endpoint redacted)');
  });

  it('never copies untrusted header contents, response bodies or the secret URL', () => {
    const secret = 'https://example.invalid/mcp/secret-value';
    const message = formatSelftestHttpFailure({
      part: 2, status: 429, contentType: 'application/custom; token='+secret,
      elapsedMs: 700,
    });
    expect(message).toBe('selftest part 2 HTTP 429 (rate limited; other response; 700ms; endpoint redacted)');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('token=');
  });
});
