const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const files = ['build.js','src/fsrs.js','src/render.js', ...fs.readdirSync('src/app').filter(f=>f.endsWith('.js')).map(f=>'src/app/'+f)];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check',file], { stdio:'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`ok: syntax for ${files.length} JavaScript files`);
