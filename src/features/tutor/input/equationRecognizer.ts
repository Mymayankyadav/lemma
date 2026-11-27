/** N221 · the main-thread side of handwritten equation recognition: the drawing as a 384 × 384 image, and the worker. */
import type {PadStrokes} from '../../../ui/v7/ink/ink';
import {inkBounds} from '../../../ui/v7/ink/images';
import {EQUATION_MODEL} from './equationModel';
import {pixelsToTensor} from './equationRecognition';
import type {EquationWorkerRequest, EquationWorkerResponse} from './equationRecognizer.worker';

/**
 * Draw the strokes black on white, cropped with a margin, then stretch the crop to the model's square input as its
 * image processor resizes a photo of a formula.
 */
export function strokesToTensor(strokes: PadStrokes, width: number): Float32Array {
  const crop = inkBounds(strokes, 24);
  if (!crop) throw new Error('Draw an equation first.');
  const scale = Math.min(4, 768 / Math.max(crop.width, crop.height));
  const paper = document.createElement('canvas');
  paper.width = Math.max(1, Math.round(crop.width * scale));
  paper.height = Math.max(1, Math.round(crop.height * scale));
  const ink = paper.getContext('2d')!;
  ink.fillStyle = '#fff';
  ink.fillRect(0, 0, paper.width, paper.height);
  ink.scale(scale, scale);
  ink.translate(-crop.x, -crop.y);
  ink.strokeStyle = '#000';
  ink.lineWidth = Math.max(width, crop.height / 40);
  ink.lineCap = 'round';
  ink.lineJoin = 'round';
  for (const stroke of strokes) {
    ink.beginPath();
    ink.moveTo(stroke[0].x, stroke[0].y);
    if (stroke.length === 1) ink.lineTo(stroke[0].x + 0.01, stroke[0].y);
    else for (const point of stroke.slice(1)) ink.lineTo(point.x, point.y);
    ink.stroke();
  }
  const size = EQUATION_MODEL.inputSize;
  const square = document.createElement('canvas');
  square.width = square.height = size;
  const out = square.getContext('2d', {willReadFrequently: true})!;
  out.imageSmoothingQuality = 'high';
  out.drawImage(paper, 0, 0, size, size);
  return pixelsToTensor(out.getImageData(0, 0, size, size).data);
}

let worker: Worker | undefined;
let nextId = 1;
function equationWorker() {
  return worker ??= new Worker(new URL('./equationRecognizer.worker.ts', import.meta.url), {type: 'module'});
}

/** N223: start loading the model if it is already on this device, so the first Read is not a cold start. */
export async function prepareEquationModel(): Promise<boolean> {
  const cached = await equationModelCached().catch(() => false);
  if (cached) equationWorker().postMessage({type: 'prepare'} satisfies EquationWorkerRequest);
  return cached;
}

/** Whether the model is already on this device. */
export function equationModelCached(): Promise<boolean> {
  return new Promise(resolve => {
    const current = equationWorker();
    const listen = (event: MessageEvent<EquationWorkerResponse>) => {
      if (event.data.type !== 'status') return;
      current.removeEventListener('message', listen);
      resolve(event.data.cached);
    };
    current.addEventListener('message', listen);
    current.postMessage({type: 'status'} satisfies EquationWorkerRequest);
  });
}

/** Recognise the drawing as LaTeX, downloading the model first if needed (`onProgress` reports bytes). */
export function recognizeEquation(strokes: PadStrokes, width: number,
  onProgress: (loaded: number, total: number) => void): Promise<string> {
  const pixels = strokesToTensor(strokes, width);
  const current = equationWorker(), id = nextId++;
  return new Promise((resolve, reject) => {
    const listen = (event: MessageEvent<EquationWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'progress') onProgress(message.loaded, message.total);
      else if ((message.type === 'result' || message.type === 'error') && message.id === id) {
        current.removeEventListener('message', listen);
        if (message.type === 'result') resolve(message.latex);
        else reject(new Error(message.message));
      }
    };
    current.addEventListener('message', listen);
    current.postMessage({type: 'recognize', id, pixels} satisfies EquationWorkerRequest, [pixels.buffer]);
  });
}
