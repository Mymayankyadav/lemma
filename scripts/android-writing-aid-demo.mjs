import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {demoStartPath, installDemoWritingAidFixture} from './android-writing-aid-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const productionId = 'io.github.mymayankyadav.lemma';
const suffix = '.writingaidtest';
const packageId = productionId + suffix;
const label = 'Lemma Writing Aid Test';
const startPath = demoStartPath;
const inputs = [
  'android', 'public', 'scripts', 'src', 'supabase/functions/_shared', '.env.production', 'assets.manifest.json',
  'capacitor.config.json', 'index.html', 'package-lock.json', 'package.json', 'tsconfig.json', 'vite.config.ts',
];
const exclude = new Set(['android/local.properties', 'android/app/firebase.properties']);

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}\n${result.stderr ?? ''}`);
  return result.stdout;
}

const hash = data => createHash('sha256').update(data).digest('hex');

function stageSource(stage) {
  const listed = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...inputs], root, true);
  const paths = [...new Set(listed.split('\0').filter(path => path && !exclude.has(path)))].sort();
  const digest = createHash('sha256');
  for (const path of paths) {
    const destination = join(stage, path);
    mkdirSync(dirname(destination), {recursive: true});
    copyFileSync(join(root, path), destination);
    digest.update(path).update('\0').update(hash(readFileSync(destination))).update('\n');
  }
  symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), 'dir');
  return digest.digest('hex');
}

function edit(path, transform) {
  const original = readFileSync(path, 'utf8');
  const updated = transform(original);
  if (updated === original) throw new Error(`Expected demo configuration in ${path}`);
  writeFileSync(path, updated);
}

function configureDemo(stage, sourceSha256) {
  const app = join(stage, 'android/app');
  const main = join(app, 'src/main');
  installDemoWritingAidFixture(join(main, 'assets/public'));
  edit(join(app, 'build.gradle'), text => text.replace('    buildTypes {\n', `    buildTypes {
        debug {
            applicationIdSuffix '${suffix}'
            versionNameSuffix '-writingaidtest.${sourceSha256.slice(0, 12)}'
        }
`));
  edit(join(main, 'assets/capacitor.config.json'), text => {
    const config = JSON.parse(text);
    if (config.appId !== productionId || config.server?.appStartPath !== '/lemma/') {
      throw new Error('The base Android application ID or launch path changed');
    }
    config.appId = packageId;
    config.appName = label;
    config.server.appStartPath = startPath;
    return JSON.stringify(config, null, 2) + '\n';
  });
  edit(join(main, 'res/values/strings.xml'), text => text
    .replace(/(<string name="(?:app_name|title_activity_main)">)[^<]+/g, '$1' + label)
    .replace(/(<string name="share_label">)[^<]+/, '$1Add to ' + label));
  edit(join(main, 'res/xml/shortcuts.xml'), text => text.replaceAll(
    `android:targetPackage="${productionId}"`, `android:targetPackage="${packageId}"`,
  ));
  // A demo installation can coexist with Lemma without intercepting its browser or Google sign-in links.
  edit(join(main, 'AndroidManifest.xml'), text => {
    const filters = [...text.matchAll(/<intent-filter\b[^>]*>[\s\S]*?<\/intent-filter>/g)]
      .map(match => match[0]).filter(filter => filter.includes('android:name="android.intent.action.VIEW"'));
    if (filters.length !== 2) throw new Error('Expected the base app-link and sign-in intent filters');
    return filters.reduce((manifest, filter) => manifest.replace(filter, ''), text);
  });
}

function verifyApk(apk, stage, sdk) {
  const tools = join(sdk, 'build-tools/36.0.0');
  run(join(tools, 'apksigner'), ['verify', '--verbose', apk], stage);
  run(join(tools, 'zipalign'), ['-c', '-P', '16', '4', apk], stage);
  const metadata = run(join(tools, 'aapt2'), ['dump', 'badging', apk], stage, true);
  if (!metadata.includes(`package: name='${packageId}'`) || !metadata.includes(`application-label:'${label}'`)) {
    throw new Error('The APK install identity does not match the demo');
  }
  const contents = join(stage, 'apk-contents');
  mkdirSync(contents);
  const jar = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/jar') : 'jar';
  run(jar, ['xf', apk, 'assets'], contents);
  const config = JSON.parse(readFileSync(join(contents, 'assets/capacitor.config.json'), 'utf8'));
  if (config.appId !== packageId || config.server.appStartPath !== startPath) {
    throw new Error('The APK launch configuration does not match the demo');
  }
  const webRoot = join(contents, 'assets/public');
  if (!readFileSync(join(webRoot, 'index.html')).equals(readFileSync(join(webRoot, 'lemma/index.html')))) {
    throw new Error('The APK launch page is missing the Lemma bundle');
  }
  if (!readFileSync(join(webRoot, 'lemma/writing-aid-test-bootstrap.js'), 'utf8').includes('Demo tutor sample for testing writing assistance.')) {
    throw new Error('The APK is missing its local writing-aid test sample');
  }
}

const output = process.argv[2] && resolve(process.argv[2]);
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!output?.endsWith('.apk') || !sdk) {
  throw new Error('Set ANDROID_HOME and run node scripts/android-writing-aid-demo.mjs /path/to/lemma-writing-aid-test.apk');
}

const stage = mkdtempSync(join(tmpdir(), 'lemma-writing-aid-demo-'));
try {
  const baseCommit = run('git', ['rev-parse', 'HEAD'], root, true).trim();
  const sourceSha256 = stageSource(stage);
  run('npm', ['run', 'build:android'], stage);
  configureDemo(stage, sourceSha256);
  const gradle = process.env.GRADLE_HOME ? join(process.env.GRADLE_HOME, 'bin/gradle') : './gradlew';
  run(gradle, ['--no-daemon', 'testDebugUnitTest', 'lintDebug', 'assembleDebug'], join(stage, 'android'));
  const apk = join(stage, 'android/app/build/outputs/apk/debug/app-debug.apk');
  verifyApk(apk, stage, resolve(sdk));
  mkdirSync(dirname(output), {recursive: true});
  copyFileSync(apk, output);
  const apkSha256 = hash(readFileSync(output));
  writeFileSync(output + '.sha256', `${apkSha256}  ${basename(output)}\n`);
  writeFileSync(output + '.build.json', JSON.stringify({baseCommit, sourceSha256, apkSha256, packageId, startPath}, null, 2) + '\n');
  console.log(`APK: ${output}\nAPK SHA-256: ${apkSha256}\nSource SHA-256: ${sourceSha256}`);
} finally {
  rmSync(stage, {recursive: true, force: true});
}
