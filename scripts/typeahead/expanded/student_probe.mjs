/** Time a deterministic, untrained shortlist GRU in a single real Web Worker. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {chromium} from '@playwright/test';

// This function is self-contained so desktop Chromium and Android's own WebView
// execute identical worker source. No model, text or requests leave the device.
function studentWorker() {
  const vocab = 16384, width = 128, hidden = 192, gates = 3 * hidden;
  let random = 253;
  function weights(size) {
    return Int8Array.from({length: size}, () => {
      random ^= random << 13;
      random ^= random >>> 17;
      random ^= random << 5;
      return (random >>> 0) % 63 - 31;
    });
  }
  const initAt = performance.now();
  const embedding = weights(vocab * width);
  const input = weights(gates * width), recurrent = weights(gates * hidden);
  const projection = weights(width * hidden);
  const inputBias = new Float32Array(gates), recurrentBias = new Float32Array(gates), outputBias = new Float32Array(width);
  const parameters = embedding.length + input.length + recurrent.length + projection.length + inputBias.length + recurrentBias.length + outputBias.length;
  const bytes = embedding.byteLength + input.byteLength + recurrent.byteLength + projection.byteLength +
    inputBias.byteLength + recurrentBias.byteLength + outputBias.byteLength;
  const state = new Float32Array(hidden), state8 = new Int8Array(hidden);
  const x = new Float32Array(gates), h = new Float32Array(gates), query = new Float32Array(width);
  const sigmoid = value => 1 / (1 + Math.exp(-value));
  function matvec(matrix, vector, scale, bias, output) {
    const cols = vector.length;
    for (let row = 0; row < output.length; row++) {
      let sum = 0;
      for (let k = 0, base = row * cols; k < cols; k++) sum += matrix[base + k] * vector[k];
      output[row] = bias[row] + sum * scale;
    }
  }
  function quantize() {
    for (let i = 0; i < hidden; i++) state8[i] = Math.max(-127, Math.min(127, Math.round(state[i] * 127)));
  }
  function step(token) {
    const vector = embedding.subarray(token * width, (token + 1) * width);
    matvec(input, vector, 1 / (64 * 128), inputBias, x);
    matvec(recurrent, state8, 1 / (127 * 128), recurrentBias, h);
    for (let i = 0; i < hidden; i++) {
      const r = sigmoid(x[i] + h[i]);
      const z = sigmoid(x[i + hidden] + h[i + hidden]);
      const n = Math.tanh(x[i + 2 * hidden] + r * h[i + 2 * hidden]);
      state[i] = (1 - z) * n + z * state[i];
    }
    quantize();
    matvec(projection, state8, 1 / (127 * 128), outputBias, query);
  }
  self.onmessage = ({data: turn}) => {
    const start = performance.now();
    step((turn * 7919 + 3) % vocab);
    const afterStep = performance.now();
    // Exactly 32 synthetic edits with 1–3 BPE pieces. Score the mean tied
    // embedding against the cached query, including all touched embedding bytes.
    let best = 0, bestScore = -Infinity, checksum = 0;
    for (let j = 0; j < 32; j++) {
      const pieces = 1 + (turn + j) % 3;
      let sum = 0;
      for (let p = 0; p < pieces; p++) {
        const base = ((turn * 173 + j * 7919 + p * 31) % vocab) * width;
        for (let k = 0; k < width; k++) sum += query[k] * embedding[base + k];
      }
      const score = sum / (64 * pieces);
      if (score > bestScore) {bestScore = score; best = j;}
      checksum = (checksum + Math.round(score * 1e5) * (j + 1)) | 0;
    }
    self.postMessage({stepMs: afterStep - start, computeMs: performance.now() - start, best, checksum});
  };
  self.postMessage({parameters, bytes, initMs: performance.now() - initAt});
}

async function runWorker(source) {
  const address = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
  const started = performance.now();
  const worker = new Worker(address);
  function response() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Student probe timed out')), 15000);
      worker.onmessage = event => {clearTimeout(timeout); resolve(event.data);};
      worker.onerror = event => {clearTimeout(timeout); reject(new Error(event.message || 'Worker failed'));};
    });
  }
  try {
    const initialized = await response();
    const coldWorkerMs = performance.now() - started;
    const samples = [], outputs = [];
    for (let turn = 0; turn < 288; turn++) {
      const start = performance.now();
      const reply = response();
      worker.postMessage(turn);
      const row = await reply;
      if (!Number.isFinite(row.computeMs) || !Number.isInteger(row.checksum)) throw new Error('Invalid worker result');
      if (turn >= 32) samples.push([row.stepMs, row.computeMs, performance.now() - start]);
      outputs.push([row.best, row.checksum]);
    }
    return {initialized, coldWorkerMs, samples, outputs};
  } finally {
    worker.terminate();
    URL.revokeObjectURL(address);
  }
}

const {values} = parseArgs({options: {android: {type: 'boolean'}, adb: {type: 'string', default: 'adb'},
  serial: {type: 'string'}, chromium: {type: 'string'}, out: {type: 'string'}}});
if (!values.out) throw new Error('Supply --out for the numerical receipt.');
let browser, port, device;
const report = {target: values.android ? 'physical Android WebView' : 'desktop Chromium', trained: false};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  let page;
  if (values.android) {
    const adb = (...args) => execFileSync(values.adb, args, {encoding: 'utf8', timeout: 20000}).trim();
    const attached = adb('devices', '-l').split('\n').slice(1).filter(row => /^\S+\s+device\b/u.test(row)).map(row => row.split(/\s/u)[0]);
    const serial = values.serial ?? (attached.length === 1 ? attached[0] : undefined);
    if (!serial || !attached.includes(serial)) throw new Error('Select one attached, authorized physical Android device.');
    device = (...args) => adb('-s', serial, ...args);
    const shell = (...args) => device('shell', ...args);
    if (serial.startsWith('emulator-') || ['ro.kernel.qemu', 'ro.boot.qemu'].some(p => shell('getprop', p) === '1')) {
      throw new Error('The phone probe requires a physical device.');
    }
    const pkg = 'io.github.mymayankyadav.lemma';
    shell('am', 'start', '-W', '-n', pkg + '/.MainActivity', '--ez', 'lemmaTypeaheadLab', 'true');
    const pid = shell('pidof', pkg).split(/\s/u)[0];
    if (!/^\d+$/u.test(pid)) throw new Error('Open the debuggable Lemma build on the target phone.');
    port = device('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
    browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
    page = browser.contexts().flatMap(context => context.pages()).find(p => new URL(p.url()).hostname === 'localhost');
    if (!page) throw new Error('Could not locate the local Lemma WebView.');
    report.deviceModel = shell('getprop', 'ro.product.model');
    report.webview = shell('dumpsys', 'webviewupdate').split('\n').find(line => line.includes('Current WebView package'))?.trim();
  } else {
    browser = await chromium.launch({executablePath: values.chromium});
    page = await browser.newPage();
  }
  const {initialized, coldWorkerMs, samples, outputs} = await page.evaluate(runWorker, '(' + studentWorker.toString() + ')()');
  if (initialized.parameters !== 2307328 || initialized.bytes !== 2311168) throw new Error('Model shape or representation changed.');
  const quantiles = index => {
    const values = samples.map(row => row[index]).sort((a, b) => a - b);
    return Object.fromEntries([50, 95, 99].map(q => ['p' + q, values[Math.ceil(q / 100 * values.length) - 1]]));
  };
  Object.assign(report, {status: 'measured', browser: browser.version(), ...initialized, coldWorkerMs,
    warmup: 32, samples: samples.length, shortlist: 32, cachedStepMs: quantiles(0), shortlistTotalMs: quantiles(1),
    workerRoundTripMs: quantiles(2), scoreChecksum: hash(JSON.stringify(outputs))});
} catch (error) {
  report.status = 'unavailable';
  report.reason = error.message;
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (port) device('forward', '--remove', 'tcp:' + port);
  report.scriptSha256 = hash(await readFile(new URL(import.meta.url)));
  await writeFile(values.out, JSON.stringify(report, null, 2) + '\n');
}
