// Dedicated fixture build on the POCO acceptance branch. Its product branch
// supplies the underlying UI, demo data, native file export and Gradle wrapper.
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const android = fileURLToPath(new URL('../android/', import.meta.url));
const env = {
  ...process.env,
  VITE_ALLOW_FLAG_OVERRIDES: '1',
  VITE_FLAGS: 'v6Shell,v7Shell,uiRepairV1,atlasAgendaV1,padLocal,tutorManualDemo,-tutorThreads,-notificationsPush',
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_PUBLISHABLE_KEY: '',
  VITE_VAPID_PUBLIC_KEY: '',
};

function run(program, args, cwd) {
  const result = spawnSync(program, args, {cwd, env, stdio:'inherit', shell:process.platform === 'win32'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'build:android'], root);
const pluginFile = new URL('../android/app/src/main/assets/capacitor.plugins.json', import.meta.url);
const packaged = JSON.parse(readFileSync(pluginFile, 'utf8'));
writeFileSync(pluginFile, JSON.stringify(packaged.filter(plugin => plugin.pkg !== '@capacitor/browser'), null, 2) + '\n');

const options = process.argv.slice(2);
if (options.some(option => option !== '--offline')) throw new Error('Supported Gradle option: --offline');
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradle, ['--no-daemon', ...options, ':app:assembleDebug', ':app:testDebugUnitTest', ':app:lintDebug'], android);
