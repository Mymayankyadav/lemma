/**
 * QA-3a: independently mergeable ST-0 evidence validator and Markdown reporter.
 * Budget PASS means the generic ST-0 measurements passed; it does not certify
 * the element's task-specific interactions or the screenshot review (QA-3b).
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stressViolations, type StressMeasurement } from './stress-limits';
import { unfinishedStressGates, type PendingStressGate } from './stress-gate';

export const QA3_PROFILES = ['stress', 'extreme'] as const;
export const QA3_THEMES = ['graph', 'graph-night'] as const;
export const QA3_WIDTHS = [390, 360] as const;
export const QA3_ROUTES = [
  '/', '/projects', '/projects/new', '/p/real-analysis',
  '/p/real-analysis/cp/CP4', '/s/real-analysis/7',
  '/proposals', '/proposals/proposal-6', '/review', '/review/run',
  '/review/done', '/cards', '/cards/31', '/atlas', '/insights',
  '/settings', '/sign-in', '/kit',
] as const;

/** QA-3 screenshot contract: a heading or decorative Graph shell alone is
 * never evidence that a route has loaded. Every route must expose its own
 * usable control or data-backed landmark before capture.
 */
export const QA3_ROUTE_READINESS: Record<(typeof QA3_ROUTES)[number], {heading:string;landmark:string;viewportAnchor?:string}> = {
 '/':{heading:'Home',landmark:'section[aria-label="From your tutor"]'},
 '/projects':{heading:'Paths',landmark:'[data-project-row]'},
 '/projects/new':{heading:'New project',landmark:'#project-title',viewportAnchor:'#project-title'},
 '/p/real-analysis':{heading:'Project',landmark:'button[aria-label^="Switch project from"]'},
 '/p/real-analysis/cp/CP4':{heading:'Checkpoint',landmark:'section[aria-label="Checkpoint steps"]',viewportAnchor:'section[aria-label="Checkpoint steps"]'},
 '/s/real-analysis/7':{heading:'Session record',landmark:'section[aria-label="Reasoning"]',viewportAnchor:'section[aria-label="Reasoning"]'},
 '/proposals':{heading:'Approve',landmark:'section[aria-label="Proposal groups"]'},
 '/proposals/proposal-6':{heading:'Plan proposal',landmark:'section[aria-label="Plan errata"]'},
 '/review':{heading:'Review',landmark:'h2:has-text("Decks")'},
 '/review/run':{heading:'Card review',landmark:'[data-review-card-scroll]',viewportAnchor:'[data-review-card-scroll]'},
 '/review/done':{heading:'Review complete',landmark:'section[aria-label="Review statistics"]'},
 '/cards':{heading:'Cards',landmark:'[data-card-row]'},
 '/cards/31':{heading:'Card detail',landmark:'article[aria-label="Card front and answer"]'},
 '/atlas':{heading:'Atlas',landmark:'[data-atlas-row]'},
 '/insights':{heading:'Insights',landmark:'h2:has-text("Reviews by")'},
 '/settings':{heading:'Settings',landmark:'h2:has-text("Teaching style")'},
 '/sign-in':{heading:'Sign in',landmark:'p:has-text("Sign-in is available in live mode.")'},
 '/kit':{heading:'Component kit',landmark:'h2:has-text("Surfaces")'},
};

/** A–I are the element groups from stress.md §2, not full behavior checks. */
export const QA3_ELEMENTS: Record<string, readonly string[]> = {
  A: ['/', '/projects', '/p/real-analysis'],
  B: ['/proposals/proposal-6'],
  C: ['/atlas'],
  D: ['/review', '/review/run', '/review/done', '/cards', '/cards/31'],
  E: ['/', '/insights'],
  F: ['/projects', '/projects/new', '/p/real-analysis'],
  G: ['/s/real-analysis/7'],
  H: ['/proposals'],
  I: QA3_ROUTES,
};

type Case = { profile: string; theme: string; width: number; filename: string };
export type Qa3Row = StressMeasurement & {
  profile: string;
  theme: string;
  width: number;
  actualRoute: string;
  violations?: string[];
};
export type Qa3Finding = {
  filename: string;
  route: string;
  failures: string[];
};
export type Qa3Element = {
  code: string;
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  measured: number;
  expected: number;
  failed: number;
  behavior: 'NOT ASSESSED';
};
export type Qa3Report = {
  status: 'PASS' | 'FAIL' | 'INCOMPLETE';
  /** Demo adapter has no live Supabase traffic; a zero count is not API evidence. */
  apiBudget: 'NOT ASSESSED';
  filesExpected: number;
  filesValid: number;
  routesExpected: number;
  routesValid: number;
  screenshotsExpected: number;
  screenshotsPresent: number | null;
  errors: string[];
  findings: Qa3Finding[];
  elements: Qa3Element[];
};

export function qa3Cases(): Case[] {
  return QA3_PROFILES.flatMap(profile =>
    QA3_THEMES.flatMap(theme =>
      QA3_WIDTHS.map(width => ({
        profile, theme, width,
        filename: profile + '-' + theme + '-' + width + '.json',
      })),
    ),
  );
}

/** ST-0 screenshot naming contract, one image per route and matrix case. */
export function qa3ScreenshotName(matrix: Case, route: string): string {
  const name = route === '/' ? 'today' : route.replaceAll('/', '-').replace(/^-/, '');
  return matrix.profile + '-' + matrix.theme + '-' + matrix.width + '-' + name + '.png';
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const numericKeys = [
  'nodes', 'horizontalOverflow', 'smallText', 'smallMath',
  'smallTargets', 'durationMs', 'cpuThrottle', 'requestCount', 'transferBytes',
] as const;

function validRow(value: unknown): value is Qa3Row {
  if (!object(value)) return false;
  if (typeof value.route !== 'string' || typeof value.actualRoute !== 'string') return false;
  if (typeof value.profile !== 'string' || typeof value.theme !== 'string') return false;
  if (typeof value.width !== 'number' || !Number.isInteger(value.width)) return false;
  if (!numericKeys.every(key => typeof value[key] === 'number' &&
    Number.isFinite(value[key]) && (value[key] as number) >= 0)) return false;
  if (value.nodes === 0 || value.cpuThrottle === 0) return false;
  if (value.minCircleGap !== null && !(typeof value.minCircleGap === 'number' &&
    Number.isFinite(value.minCircleGap) && value.minCircleGap >= 0)) return false;
  return true;
}

/**
 * Accept an in-memory map keyed by the ST-0 JSON filenames. This is pure,
 * so fixtures can test malformed/missing evidence without browser access.
 */
export function analyzeQa3(
  files: Record<string, unknown>, screenshots?: ReadonlySet<string>,
  options: { release?: boolean; pendingGates?: readonly PendingStressGate[] } = {},
): Qa3Report {
  const errors: string[] = [];
  const findings: Qa3Finding[] = [];
  const validRows: Qa3Row[] = [];
  let filesValid = 0;
  const expectedRoutes = new Set<string>(QA3_ROUTES);
  const cases = qa3Cases();
  let screenshotsPresent = 0;
  if (screenshots) for (const matrix of cases) for (const route of QA3_ROUTES) {
    const name = qa3ScreenshotName(matrix, route);
    if (screenshots.has(name)) screenshotsPresent++;
    else errors.push('missing screenshot ' + name);
  }

  for (const matrix of cases) {
    const payload = files[matrix.filename];
    if (!Array.isArray(payload)) {
      errors.push(matrix.filename + ': missing or non-array evidence');
      continue;
    }
    const errorCountBefore = errors.length;
    const seen = new Set<string>();
    for (const [index, candidate] of payload.entries()) {
      if (!validRow(candidate)) {
        errors.push(matrix.filename + ': malformed measurement at index ' + index);
        continue;
      }
      const row = candidate;
      if (row.profile !== matrix.profile || row.theme !== matrix.theme ||
          row.width !== matrix.width) {
        errors.push(matrix.filename + ': mismatched matrix metadata for ' + row.route);
        continue;
      }
      if (!expectedRoutes.has(row.route)) {
        errors.push(matrix.filename + ': unknown route ' + row.route);
        continue;
      }
      if (seen.has(row.route)) {
        errors.push(matrix.filename + ': duplicate route ' + row.route);
        continue;
      }
      seen.add(row.route);
      if (row.cpuThrottle < 4) {
        errors.push(matrix.filename + ': route ' + row.route + ' not measured under 4x CPU throttle');
        continue;
      }
      if (row.actualRoute !== row.route) {
        errors.push(matrix.filename + ': stale route ' + row.route +
          ' (rendered ' + row.actualRoute + ')');
        continue;
      }
      validRows.push(row);
      // Always recalculate, rather than trusting the producer's saved array.
      const failures = stressViolations(row);
      if (failures.length) findings.push({ filename: matrix.filename, route: row.route, failures });
    }
    for (const route of QA3_ROUTES) {
      if (!seen.has(route)) errors.push(matrix.filename + ': missing route ' + route);
    }
    if (errors.length === errorCountBefore) filesValid++;
  }

  // QA-3b release cannot inherit ST-0's temporary audit exceptions.
  if (options.release) for (const gate of options.pendingGates ?? unfinishedStressGates) {
    errors.push('QA-3 release blocked by unresolved audit #' + gate.issue);
  }

  const elements = Object.entries(QA3_ELEMENTS).map(([code, routes]): Qa3Element => {
    const relevant = validRows.filter(row => routes.includes(row.route));
    const failed = findings.filter(item => routes.includes(item.route)).length;
    const expected = cases.length * routes.length;
    return {
      code,
      status: relevant.length !== expected ? 'INCOMPLETE' : failed ? 'FAIL' : 'PASS',
      measured: relevant.length, expected, failed, behavior: 'NOT ASSESSED',
    };
  });
  const status = errors.length || validRows.length !== cases.length * QA3_ROUTES.length
    ? 'INCOMPLETE' : findings.length ? 'FAIL' : 'PASS';
  return {
    status, apiBudget: 'NOT ASSESSED', filesExpected: cases.length, filesValid,
    routesExpected: cases.length * QA3_ROUTES.length,
    routesValid: validRows.length,
    screenshotsExpected: cases.length * QA3_ROUTES.length,
    screenshotsPresent: screenshots ? screenshotsPresent : null,
    errors, findings, elements,
  };
}

export function renderQa3Markdown(report: Qa3Report): string {
  const lines = [
    '# QA-3a — ST-0 stress budget evidence',
    '',
    '**Generic UI budget status: ' + report.status + '**',
    '**Live API budget: ' + report.apiBudget + '** — the demo adapter performs no Supabase requests; zero requests do not demonstrate the live 3-request/1-request or 200 kB limits.',
    '',
    'Matrix: ' + report.filesValid + '/' + report.filesExpected +
      ' files; ' + report.routesValid + '/' + report.routesExpected + ' route measurements.',
    'Screenshots: ' + (report.screenshotsPresent === null ? 'not checked' :
      report.screenshotsPresent + '/' + report.screenshotsExpected + ' files present') +
      ' (presence only; visual review is still required).',
    '',
    'This report covers only the generic ST-0 hard budgets (layout, tap targets,',
    'type sizes, DOM count and render time at 4x CPU for every route).',
    'The live Today/Insights request and transfer budgets require separate authenticated or faithfully intercepted-network evidence in QA-3b.',
    '**It does not certify the A–I behavioral acceptance or screenshot review.**',
    'Those remain QA-3b gates after the dependent feature PRs merge.',
    '',
    '| Stress element | Generic budget | Measured / expected | Failed routes | Behavior / screenshots |',
    '| --- | --- | ---: | ---: | --- |',
  ];
  for (const element of report.elements) {
    lines.push('| ' + element.code + ' | ' + element.status + ' | ' +
      element.measured + ' / ' + element.expected + ' | ' + element.failed +
      ' | ' + element.behavior + ' |');
  }
  lines.push('', '## Evidence errors', '');
  if (report.errors.length) for (const error of report.errors) lines.push('- ' + error);
  else lines.push('None.');
  lines.push('', '## Hard-budget violations', '');
  if (report.findings.length) {
    for (const item of report.findings) {
      lines.push('- ' + item.filename + ' · ' + item.route + ': ' + item.failures.join('; '));
    }
  } else lines.push('None.');
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const input = process.argv[2] ?? 'test-results/stress';
  const output = process.argv[3] ?? 'test-results/qa3/stress-budget-report.md';
  const screenDir = process.argv[4] ?? 'test-results/screens/stress';
  const files: Record<string, unknown> = {};
  for (const { filename } of qa3Cases()) {
    try {
      files[filename] = JSON.parse(readFileSync(resolve(input, filename), 'utf8')) as unknown;
    } catch {
      // A missing or corrupt file is a hard incomplete-evidence failure.
      files[filename] = null;
    }
  }
  let screenshots: ReadonlySet<string>;
  try { screenshots = new Set(readdirSync(resolve(screenDir))); }
  catch { screenshots = new Set(); }
  const report = analyzeQa3(files, screenshots);
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(resolve(output), renderQa3Markdown(report), 'utf8');
  process.stdout.write('QA-3a ' + report.status + ' · ' + report.routesValid +
    '/' + report.routesExpected + ' route measurements · report ' + output + '\n');
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
