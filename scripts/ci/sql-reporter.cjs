// Preloaded with NODE_OPTIONS=--require=./scripts/ci/sql-reporter.cjs so the plain `node tests/mcp/<x>.mjs`
// steps keep their literal command line but still emit one JUnit file ($CI_JUNIT_DIR/sql-<script>.xml).
'use strict';
const fs = require('fs');
const path = require('path');
const dir = process.env.CI_JUNIT_DIR;
const script = process.argv[1];
if (dir && script && /tests[\\/]mcp[\\/]/.test(script)) {
  const rel = path.relative(process.cwd(), script).replace(/\\/g, '/');
  const tail = [];
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => { tail.push(String(chunk)); if (tail.length > 400) tail.shift(); return write(chunk, ...rest); };
  }
  let thrown = '';
  // Node prints uncaught errors below process.stderr, so capture them explicitly (and keep default behaviour).
  process.on('uncaughtException', (err) => {
    thrown = String((err && err.message) || err).split('\n')[0];
    process.stderr.write(String((err && err.stack) || err) + '\n');
    process.exit(1);
  });
  const started = Date.now();
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  process.on('exit', (code) => {
    try {
      const failed = (process.exitCode ?? code) !== 0;
      const lines = tail.join('').split('\n').map((l) => l.trim()).filter(Boolean);
      const msg = failed
        ? (thrown || lines.find((l) => /^\w*(Error|AssertionError)\b/.test(l)) || lines.find((l) => /fail|assert|exceed|must/i.test(l) && !/^at /.test(l)) || lines[lines.length - 1] || 'script exited non-zero')
        : '';
      const secs = ((Date.now() - started) / 1000).toFixed(3);
      const name = path.basename(rel);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `sql-${name}.xml`),
        `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="${esc(rel)}" tests="1" failures="${failed ? 1 : 0}" time="${secs}">` +
        `<testcase classname="${esc(rel)}" name="${esc(name)}" time="${secs}">${failed ? `<failure message="${esc(msg)}">${esc(lines.slice(-30).join('\n'))}</failure>` : ''}</testcase></testsuite></testsuites>\n`);
    } catch { /* never break the test run */ }
  });
}
