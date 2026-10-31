import { describe, expect, it } from 'vitest';
import {
  analyzeQa3, qa3Cases, qa3ScreenshotName, QA3_ROUTES, renderQa3Markdown,
} from '../../../scripts/qa3-report';

function evidence(): Record<string, unknown> {
  const files: Record<string, unknown> = {};
  for (const { profile, theme, width, filename } of qa3Cases()) {
    files[filename] = QA3_ROUTES.map(route => ({
      route, actualRoute: route, profile, theme, width,
      nodes: 400, horizontalOverflow: 0, smallText: 0, smallMath: 0,
      smallTargets: 0, minCircleGap: null,
      durationMs: 200, requestCount: 0, transferBytes: 0,
      cpuThrottle: 4,
      violations: ['stale producer value is not trusted'],
    }));
  }
  return files;
}

describe('QA-3a stress evidence', () => {
  it('accepts the complete eight-case matrix and all 18 routes', () => {
    const report = analyzeQa3(evidence());
    expect(report.status).toBe('PASS');
    expect(report.filesValid).toBe(8);
    expect(report.routesValid).toBe(144);
    expect(report.errors).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.elements.map(e => e.code)).toEqual(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    );
    expect(report.elements.every(e => e.status === 'PASS' &&
      e.behavior === 'NOT ASSESSED')).toBe(true);
    expect(renderQa3Markdown(report)).toContain('does not certify');
  });

  it('does not certify live API budgets from zero-request demo measurements', () => {
    const report = analyzeQa3(evidence());
    expect(report.status).toBe('PASS'); // UI-only generic budgets still pass
    expect(report.apiBudget).toBe('NOT ASSESSED');
    const markdown = renderQa3Markdown(report);
    expect(markdown).toContain('Live API budget: NOT ASSESSED');
    expect(markdown).toContain('demo adapter');
  });

  it('cannot certify QA-3 release while a named stress gate awaits Auditor clearance', () => {
    const report = analyzeQa3(evidence(), undefined, {
      release: true,
      pendingGates: [{ issue: 485, failure: 'maths below 16px', routes: ['/atlas'] }],
    });
    expect(report.status).toBe('INCOMPLETE');
    expect(report.errors).toContain('QA-3 release blocked by unresolved audit #485');
    expect(renderQa3Markdown(report)).toContain('QA-3 release blocked');
  });

  it('rejects a missing matrix file and reports incomplete evidence', () => {
    const files = evidence();
    delete files[qa3Cases()[0].filename];
    const report = analyzeQa3(files);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.filesValid).toBe(7);
    expect(report.errors).toContain(qa3Cases()[0].filename + ': missing or non-array evidence');
  });

  it('rejects missing, duplicate and unknown routes without masking them', () => {
    const files = evidence();
    const filename = qa3Cases()[0].filename;
    const rows = files[filename] as Record<string, unknown>[];
    rows.pop();
    rows.push({ ...rows[0] });
    rows.push({ ...rows[0], route: '/not-a-route', actualRoute: '/not-a-route' });
    const report = analyzeQa3(files);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.errors.some(e => e.includes('duplicate route /'))).toBe(true);
    expect(report.errors.some(e => e.includes('unknown route /not-a-route'))).toBe(true);
    expect(report.errors.some(e => e.includes('missing route /kit'))).toBe(true);
  });

  it('rejects stale route content and incorrect matrix metadata', () => {
    const files = evidence();
    const filename = qa3Cases()[0].filename;
    const rows = files[filename] as Record<string, unknown>[];
    rows[0] = { ...rows[0], actualRoute: '/projects' };
    rows[1] = { ...rows[1], theme: 'graph-night' };
    const report = analyzeQa3(files);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.errors.some(e => e.includes('stale route /'))).toBe(true);
    expect(report.errors.some(e => e.includes('mismatched matrix metadata'))).toBe(true);
  });

  it('rejects non-finite, negative, zero-node and missing numeric fields', () => {
    for (const broken of [
      { durationMs: Number.NaN }, { transferBytes: Infinity },
      { smallTargets: -1 }, { nodes: 0 }, { requestCount: undefined },
      { minCircleGap: Number.NaN },
    ]) {
      const files = evidence();
      const filename = qa3Cases()[0].filename;
      const rows = files[filename] as Record<string, unknown>[];
      rows[0] = { ...rows[0], ...broken };
      const report = analyzeQa3(files);
      expect(report.status).toBe('INCOMPLETE');
      expect(report.errors.some(e => e.includes('malformed measurement'))).toBe(true);
    }
  });

  it('rejects a baseline that silently disables the 4x CPU first-render check', () => {
    const files = evidence();
    const filename = qa3Cases()[0].filename;
    const rows = files[filename] as Record<string, unknown>[];
    rows[0] = { ...rows[0], cpuThrottle: 1 };
    const report = analyzeQa3(files);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.errors.some(e => e.includes('not measured under 4x CPU'))).toBe(true);
  });

  it('fails closed when a non-Today route has only 1x CPU evidence', () => {
    const files = evidence();
    const filename = qa3Cases()[0].filename;
    const rows = files[filename] as Record<string, unknown>[];
    rows[1] = { ...rows[1], cpuThrottle: 1 };
    const report = analyzeQa3(files);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.filesValid).toBe(7);
    expect(report.errors).toContain(filename + ': route /projects not measured under 4x CPU throttle');
    expect(report.elements.find(e => e.code === 'I')?.status).toBe('INCOMPLETE');
  });

  it('recomputes hard violations and assigns failures to affected elements', () => {
    const files = evidence();
    const filename = qa3Cases()[0].filename;
    const rows = files[filename] as Record<string, unknown>[];
    rows[0] = { ...rows[0], horizontalOverflow: 4, smallTargets: 1 };
    const report = analyzeQa3(files);
    expect(report.status).toBe('FAIL');
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].failures).toContain('horizontal overflow');
    expect(report.findings[0].failures).toContain('tap target below 44px');
    expect(report.elements.find(e => e.code === 'A')?.status).toBe('FAIL');
    expect(report.elements.find(e => e.code === 'I')?.status).toBe('FAIL');
    expect(report.elements.find(e => e.code === 'B')?.status).toBe('PASS');
    expect(renderQa3Markdown(report)).toContain('Hard-budget violations');
  });

  it('checks all 144 screenshot files without mistaking presence for visual approval', () => {
    const images = new Set(qa3Cases().flatMap(matrix =>
      QA3_ROUTES.map(route => qa3ScreenshotName(matrix, route))));
    expect(images.size).toBe(144);
    expect(images.has('stress-graph-390-today.png')).toBe(true);
    expect(images.has('extreme-graph-night-360-p-real-analysis.png')).toBe(true);
    const complete = analyzeQa3(evidence(), images);
    expect(complete.status).toBe('PASS');
    expect(complete.screenshotsPresent).toBe(144);
    expect(renderQa3Markdown(complete)).toContain('visual review is still required');
    images.delete('stress-graph-390-today.png');
    const incomplete = analyzeQa3(evidence(), images);
    expect(incomplete.status).toBe('INCOMPLETE');
    expect(incomplete.errors).toContain('missing screenshot stress-graph-390-today.png');
  });

  it('rejects corrupt JSON payloads and does not certify behavior', () => {
    const files = evidence();
    files[qa3Cases()[1].filename] = { error: 'invalid JSON' };
    const report = analyzeQa3(files);
    expect(report.status).toBe('INCOMPLETE');
    expect(report.elements.some(e => e.status === 'INCOMPLETE')).toBe(true);
    expect(renderQa3Markdown(report)).toContain('NOT ASSESSED');
  });
});
