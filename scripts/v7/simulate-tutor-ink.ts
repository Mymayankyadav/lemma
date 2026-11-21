import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { decideRecognition } from "../../src/features/tutor/input/recognitionPolicy";
import { matchPartialSymbols } from "../../src/features/tutor/input/partialSymbolMatcher";
import { symbolById } from "../../src/features/tutor/input/symbolCatalog";
import type {
  InkWorkerRequest, InkWorkerResponse, ModelClass,
} from "../../src/features/tutor/input/inkRecognizerProtocol";
import type { InkInferenceResult, InkSnapshot, InkStroke } from "../../src/features/tutor/input/types";
import { CORPUS_STYLES, syntheticTraces, VIEWPORT, type SyntheticTrace } from "./tutor-ink-fixtures";
import { HUMANLIKE_SEEDS, humanlikeTraces } from "./tutor-ink-humanlike-fixtures";

const { values } = parseArgs({ options: {
  url: { type: "string", default: "http://127.0.0.1:4182/lemma/" },
  dist: { type: "string", default: "dist" },
  output: { type: "string" },
  corpus: { type: "string", default: "standard" },
  chromium: { type: "string" },
} });
const base = new URL(values.url!);
const dist = resolve(values.dist!);
if (values.corpus !== "standard" && values.corpus !== "humanlike") throw Error("Unknown corpus. Use standard or humanlike.");
const humanlike = values.corpus === "humanlike";
const output = resolve(values.output ?? "docs/implementation/2026-11-21/ink-simulation" + (humanlike ? "/humanlike-stress" : ""));
const manifest = JSON.parse(await readFile(
  "public/models/tutor-symbols/detypify-0.3.0-lemma-v1/manifest.json", "utf8",
));
const version: string = manifest.assetSetVersion;
const classCount: number = manifest.model.outputShape[1];
const workers = (await readdir(resolve(dist, "assets"))).filter(name => /^inkRecognizer\.worker-.+\.js$/.test(name));
if (workers.length !== 1) throw Error("Expected one production ink worker in the supplied Vite dist.");
const workerPath = new URL("assets/" + workers[0], base).href;
const workerSha256 = createHash("sha256").update(await readFile(resolve(dist, "assets", workers[0]))).digest("hex");
const traces = humanlike ? humanlikeTraces() : syntheticTraces();
for (const trace of traces) {
  for (const id of [trace.intended, trace.drawn, ...(trace.extensions ?? [])]) {
    if (id && !symbolById(id)) throw Error(`Unknown annotated symbol ${id} in ${trace.id}`);
  }
}

async function runModel(strokeSets: InkStroke[][]) {
  const browser = await chromium.launch({ executablePath: values.chromium });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === base.origin
      ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(new URL("privacy.html", base).href);
    const results = await page.evaluate(async ({ workerPath, version, classCount, strokeSets }) => {
      const setupStart = performance.now();
      const worker = new Worker(workerPath, { type: "module" });
      try {
        const model = {
          request(message: InkWorkerRequest) {
            return new Promise<InkWorkerResponse>((resolve, reject) => {
              const timeout = setTimeout(() => reject(Error("Inference worker timed out")), 30_000);
              worker.onmessage = event => { clearTimeout(timeout); resolve(event.data); };
              worker.onerror = event => { clearTimeout(timeout); reject(Error(event.message)); };
              worker.postMessage(message);
            });
          },
        };
        const ready = await model.request({ type: "prepare", assetSetVersion: version });
        if (ready.type !== "ready" || ready.assetSetVersion !== version || ready.raster !== "worker" ||
            ready.classes.length !== classCount) {
          throw Error("The production worker is unavailable or has different model inputs/classes.");
        }
        const setupMs = performance.now() - setupStart;
        const runs: { scores: number[] | null; elapsedMs: number }[] = [];
        for (const [index, strokes] of strokeSets.entries()) {
          const start = performance.now();
          const result = await model.request({
            type: "infer", assetSetVersion: version, requestId: index + 1, input: { kind: "strokes", strokes },
          });
          if (result.type !== "result" || result.requestId !== index + 1 ||
              result.assetSetVersion !== version || (result.scores && (!result.scores.every(Number.isFinite) ||
              result.scores.length !== classCount))) throw Error("Invalid production worker result");
          runs.push({ scores: result.scores ? Array.from(result.scores) : null, elapsedMs: performance.now() - start });
        }
        return { classes: ready.classes, setupMs, runs };
      } finally {
        worker.terminate();
      }
    }, { workerPath, version, classCount, strokeSets });
    return { chromium: browser.version(), ...results };
  } finally {
    await browser.close();
  }
}

/** Rank from every class in the original model denominator. Mapped aliases share their canonical mass. */
function modelRanks(classes: readonly ModelClass[], scores: number[] | null) {
  if (!scores) return { mapped: [] as [string, number][], unknownMass: 1, bestClass: "" };
  const maximum = Math.max(...scores);
  const weights = scores.map(score => Math.exp(score - maximum));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const mass = new Map<string, number>();
  let unknownMass = 0;
  for (const [index, entry] of classes.entries()) {
    const probability = weights[index] / total;
    if (entry.symbolId && symbolById(entry.symbolId)) {
      mass.set(entry.symbolId, (mass.get(entry.symbolId) ?? 0) + probability);
    } else unknownMass += probability;
  }
  const mapped = [...mass].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { mapped, unknownMass, bestClass: classes[scores.indexOf(maximum)].classId };
}

/** Mirror TutorInkPad's three distinct glyphs per group, with extension precedence. */
function visibleCandidates(matches: readonly string[], extensions: readonly string[]) {
  const seen = new Set<string>();
  function group(ids: readonly string[]) {
    const shown: string[] = [];
    for (const id of ids) {
      const glyph = symbolById(id)?.glyph;
      if (!glyph || seen.has(glyph)) continue;
      seen.add(glyph);
      shown.push(id);
      if (shown.length === 3) break;
    }
    return shown;
  }
  const displayedExtensions = group(extensions);
  const displayedMatches = group(matches);
  return { displayedMatches, displayedExtensions };
}

function describeCase(trace: SyntheticTrace, classes: readonly ModelClass[], run: { scores: number[] | null; elapsedMs: number }) {
  const snapshot: InkSnapshot = {
    target: { scopeKey: "synthetic", mountId: trace.id, editorRevision: 0, selectionRevision: 0, modeRevision: 0 },
    sessionId: trace.id, inkEpoch: 0, inkRevision: 1, completedRevision: 1,
    sampledAtMs: 0, assetSetVersion: version, viewport: VIEWPORT,
    strokes: trace.strokes, overBudget: false, interrupted: false,
  };
  const inference: InkInferenceResult = {
    ...snapshot, scoreKind: "logit", rawScores: run.scores?.map((score, index) => ({ ...classes[index], score })) ?? [],
  };
  const geometry = matchPartialSymbols(snapshot);
  const decision = decideRecognition(snapshot, inference, geometry);
  if (decision.qualifiedForAuto) throw Error("Production inserted without compatible calibration");
  const { mapped, unknownMass, bestClass } = modelRanks(classes, run.scores);
  const bestId = mapped[0]?.[0] ?? "";
  const bestMass = mapped[0]?.[1] ?? 0;
  const secondMass = mapped[1]?.[1] ?? 0;
  const geometryIds = geometry.exactMatches?.map(candidate => candidate.symbolId) ?? [];
  const uiRank = [...geometryIds, ...(bestMass >= .06
    ? mapped.filter(([id, weight]) => weight > 0 && !geometryIds.includes(id)).map(([id]) => id) : [])];
  const policyRank = decision.recognized.map(candidate => candidate.symbolId);
  if (JSON.stringify(uiRank.slice(0, policyRank.length)) !== JSON.stringify(policyRank)) {
    throw Error(`Simulation ranks diverge from the shipping candidate policy for ${trace.id}`);
  }
  const possibleCompletions = decision.possibleCompletions.map(candidate => candidate.symbolId);
  const modelTopIsCorrect = trace.kind === "complete" && bestId === trace.intended;
  return {
    id: trace.id, split: trace.split, style: trace.style, fixture: trace.name, kind: trace.kind,
    prototypeCohort: trace.prototypeCohort ?? "", condition: trace.condition ?? "",
    intended: trace.intended ?? "", drawn: trace.drawn ?? "",
    modelHasIntendedClass: classes.some(entry => Boolean(trace.intended) && entry.symbolId === trace.intended),
    rawClassCount: run.scores?.length ?? 0, bestRawClass: bestClass, bestMapped: bestId,
    bestMass, secondMass, margin: bestMass - secondMass, unknownMass,
    modelRank: mapped.slice(0, 7).map(([id]) => id), uiRank: uiRank.slice(0, 7),
    policyRank, possibleCompletions, ...visibleCandidates(policyRank, possibleCompletions),
    validExtensions: trace.extensions ?? [], geometryOnly: geometryIds.length > 0,
    completion: decision.completionDecision,
    finishedForModel: decision.completionDecision === "finished" && decision.recognized[0]?.source === "model",
    modelTopIsCorrect, elapsedMs: run.elapsedMs,
  };
}

type Attempt = ReturnType<typeof describeCase>;
const confidenceGrid = [.3, .4, .5, .6, .7, .8, .85, .9, .93, .95, .97, .99, .999];
const marginGrid = [.05, .10, .20, .35];
const unknownGrid = [.05, .10, .20, .40];
type Gate = "identity" | "identity-and-completion";

function evaluate(attempts: Attempt[], confidence: number, margin: number, unknownLimit: number, gate: Gate) {
  const eligible = attempts.filter(a => a.modelTopIsCorrect).length;
  const accepted = attempts.filter(a => a.bestMass >= confidence && a.margin >= margin &&
    a.unknownMass <= unknownLimit && !a.geometryOnly && (gate === "identity" || a.finishedForModel));
  const correct = accepted.filter(a => a.modelTopIsCorrect).length;
  const incorrect = accepted.length - correct;
  const count = (kind: Attempt["kind"]) => accepted.filter(a => a.kind === kind && !a.modelTopIsCorrect).length;
  return {
    split: attempts[0].split, gate, confidence, margin, unknownLimit,
    attempts: attempts.length, eligible, ineligible: attempts.length - eligible,
    accepted: accepted.length, correct, incorrect,
    wrongCompleted: count("complete"), partial: count("partial"), ambiguous: count("ambiguous"),
    unsupported: count("unsupported"), wrongIntent: count("wrong-intent"), invalid: count("invalid"),
    tpr: correct / eligible, fpr: incorrect / (attempts.length - eligible),
    precision: accepted.length ? correct / accepted.length : null,
    coverage: accepted.length / attempts.length,
    correctCoverage: correct / attempts.filter(a => a.kind === "complete").length,
    netTapsSavedExample: correct - 5 * incorrect,
  };
}

function splitSummary(attempts: Attempt[]) {
  const complete = attempts.filter(a => a.kind === "complete");
  const modelSupported = complete.filter(a => a.modelHasIntendedClass);
  const partial = attempts.filter(a => a.kind === "partial");
  const completeExtendable = complete.filter(a => a.validExtensions.length > 0);
  const partialWithShorter = partial.filter(a => a.drawn);
  const countRecall = (rows: Attempt[], field: "modelRank" | "uiRank", k: number) =>
    rows.filter(a => a[field].slice(0, k).includes(a.intended)).length;
  return {
    attempts: attempts.length,
    byKind: Object.fromEntries([...new Set(attempts.map(a => a.kind))].map(kind => [
      kind, attempts.filter(a => a.kind === kind).length,
    ])),
    modelSupportedCompleted: modelSupported.length,
    modelTop1: countRecall(modelSupported, "modelRank", 1),
    candidateBudget: [1, 3, 5, 7].map(k => ({
      k, modelOnlyRecalled: countRecall(modelSupported, "modelRank", k),
      geometryFirstSimulationRecalled: countRecall(complete, "uiRank", k),
      meanSimulatedMatches: complete.reduce((sum, a) => sum + Math.min(k, a.uiRank.length), 0) / complete.length,
    })),
    policyRecall: complete.filter(a => a.policyRank.includes(a.intended)).length,
    extensionBudget: [1, 2, 3, 5].map(k => {
      const proposed = partial.map(a => a.possibleCompletions.slice(0, k));
      return {
        k, intended: partial.filter((a, index) => proposed[index].includes(a.intended)).length,
        proposals: proposed.reduce((sum, row) => sum + row.length, 0),
        unannotated: partial.reduce((sum, a, index) =>
          sum + proposed[index].filter(id => !a.validExtensions.includes(id)).length, 0),
      };
    }),
    partialByFixture: Object.fromEntries([...new Set(partial.map(a => a.fixture))].map(fixture => {
      const rows = partial.filter(a => a.fixture === fixture);
      return [fixture, { attempts: rows.length, intended: rows.filter(a => a.possibleCompletions.includes(a.intended)).length }];
    })),
    partialExtensionIntended: partial.filter(a => a.possibleCompletions.includes(a.intended)).length,
    partialAnyValidExtension: partial.filter(a => a.possibleCompletions.some(id => a.validExtensions.includes(id))).length,
    partialWithShorter: partialWithShorter.length,
    partialShorterShown: partialWithShorter.filter(a => a.uiRank.slice(0, 5).includes(a.drawn)).length,
    completeShorterCouldBecome: completeExtendable.filter(a =>
      a.possibleCompletions.some(id => a.validExtensions.includes(id))).length,
    completeShorter: completeExtendable.length,
    completionStates: Object.fromEntries(["finished", "extendable", "unknown"].map(state =>
      [state, attempts.filter(a => a.completion === state).length])),
    emittedModelScores: attempts.filter(a => a.rawClassCount === classCount).length,
  };
}

function displayedSummary(attempts: Attempt[]) {
  const complete = attempts.filter(a => a.kind === "complete");
  const partial = attempts.filter(a => a.kind === "partial");
  const shorter = partial.filter(a => a.drawn);
  const inGroup = (a: Attempt, groups: readonly string[]) => groups.includes(a.intended);
  return {
    attempts: attempts.length,
    complete: complete.length,
    completeInMatches: complete.filter(a => inGroup(a, a.displayedMatches)).length,
    completeInEitherGroup: complete.filter(a => inGroup(a, [...a.displayedMatches, ...a.displayedExtensions])).length,
    completeWithClassifierClass: complete.filter(a => a.modelHasIntendedClass).length,
    completeWithClassInEitherGroup: complete.filter(a => a.modelHasIntendedClass &&
      inGroup(a,[...a.displayedMatches,...a.displayedExtensions])).length,
    partial: partial.length,
    partialIntendedInCouldBecome: partial.filter(a => inGroup(a, a.displayedExtensions)).length,
    partialIntendedInEitherGroup: partial.filter(a => inGroup(a, [...a.displayedMatches, ...a.displayedExtensions])).length,
    partialWithShorter: shorter.length,
    partialShorterInMatches: shorter.filter(a => a.displayedMatches.includes(a.drawn)).length,
    unannotatedExtensionProposals: partial.reduce((sum,a) => sum + a.displayedExtensions.filter(id => !a.validExtensions.includes(id)).length, 0),
  };
}

function groupSummary(attempts: Attempt[], field: "prototypeCohort" | "style" | "fixture") {
  const keys = new Set(attempts.map(a => a[field]));
  return Object.fromEntries([...keys].map(key => [key, displayedSummary(attempts.filter(a => a[field] === key))]));
}

function csv(rows: Record<string, unknown>[]) {
  const keys = Object.keys(rows[0]);
  function encode(value: unknown) {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[,\n\r"]/.test(str) ? '"' + str.replaceAll('"', '""') + '"' : str;
  }
  return keys.join(",") + "\n" + rows.map(row => keys.map(key => encode(row[key])).join(",")).join("\n") + "\n";
}

const runtime = await runModel(traces.map(trace => trace.strokes));
const attempts = traces.map((trace, index) => describeCase(trace, runtime.classes, runtime.runs[index]));
const groups = {
  tuning: attempts.filter(a => a.split === "tuning"),
  test: attempts.filter(a => a.split === "test"),
};
const grid = Object.values(groups).flatMap(group => (["identity", "identity-and-completion"] as const).flatMap(gate =>
  confidenceGrid.flatMap(confidence => marginGrid.flatMap(margin => unknownGrid.map(unknownLimit =>
    evaluate(group, confidence, margin, unknownLimit, gate),
  ))),
));
const rocConfidence = [
  ...Array.from({ length: 100 }, (_, index) => index / 100),
  ...Array.from({ length: 9 }, (_, index) => (991 + index) / 1_000),
  .9995, .9999, 1, 1.01,
];
const frontier = Object.values(groups).flatMap(group => (["identity", "identity-and-completion"] as const).flatMap(gate =>
  rocConfidence.map(confidence => evaluate(group, confidence, .10, .20, gate)),
));
const freeze = grid.filter(row => row.split === "tuning" && row.gate === "identity-and-completion" &&
  row.confidence >= .5 && row.incorrect === 0 && row.accepted > 0)
  .sort((a,b) => b.correct - a.correct || b.confidence - a.confidence || b.margin - a.margin || a.unknownLimit - b.unknownLimit)[0];
const comparison = (["identity", "identity-and-completion"] as const).map(gate => evaluate(groups.test, .75, .15, .20, gate));
const summary = {
  corpus: values.corpus, assetSetVersion: version, preprocessing: manifest.preprocessing.version, modelHash: manifest.files.model.sha256,
  worker: workers[0], workerSha256, chromium: runtime.chromium, classCount, mappedClasses: runtime.classes.filter(c => c.symbolId).length,
  seeds: humanlike ? HUMANLIKE_SEEDS : CORPUS_STYLES,
  counts: { tuning: splitSummary(groups.tuning), test: splitSummary(groups.test) },
  frozenOperatingPoint: freeze ? { tuning: freeze, test: evaluate(groups.test, freeze.confidence, freeze.margin, freeze.unknownLimit, freeze.gate) } : null,
  fixedTestComparison: comparison, setupMsDiagnostic: runtime.setupMs,
  ...(humanlike && {
    originalCorpusPointOnStress: evaluate(groups.test, .97, .35, .05, "identity-and-completion"),
    displayed: Object.fromEntries(Object.entries(groups).map(([split, group]) => [split, {
      ...displayedSummary(group), byCohort: groupSummary(group,"prototypeCohort"), byStyle: groupSummary(group,"style"),
      byFixture: groupSummary(group.filter(row => row.kind === "complete" || row.kind === "partial"),"fixture"),
    }])),
  }),
};
await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(resolve(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n"),
  writeFile(resolve(output, "attempts.csv"), csv(attempts)),
  writeFile(resolve(output, "sweep.csv"), csv(grid)),
  writeFile(resolve(output, "roc-points.csv"), csv(frontier)),
]);
console.log(JSON.stringify(summary, null, 2));
