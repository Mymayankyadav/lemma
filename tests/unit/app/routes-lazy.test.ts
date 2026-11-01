import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Regression for FIX #632: the ST-0 cold Today budget must not parse the
// other fifteen route modules before the first meaningful goal paint.
const routes = readFileSync('src/app/routes.tsx', 'utf8');
const screens = [
  ['/', 'home'],
  ['/projects', 'projects'],
  ['/projects/new', 'new-project'],
  ['/p/:slug', 'project'],
  ['/p/:slug/cp/:code', 'checkpoint'],
  ['/s/:slug/:n', 'session'],
  ['/proposals', 'proposals'],
  ['/proposals/:id', 'plan-proposal'],
  ['/review', 'review'],
  ['/review/run', 'review-run'],
  ['/review/done', 'review-done'],
  ['/cards', 'cards'],
  ['/cards/:no', 'card'],
  ['/atlas', 'atlas'],
  ['/insights', 'insights'],
  ['/settings', 'settings'],
  ['/sign-in', 'sign-in'],
  ['/kit', 'kit'],
] as const;

describe('FIX #632: Today entry does not eagerly import unrelated routes', () => {
  it('keeps Today eager so the first goal is not held behind an extra chunk', () => {
    expect(routes).toMatch(/import Page0 from ['"]\.\.\/features\/home\/Page['"]/);
  });

  it('keeps Paths eager for direct-route/transition readiness and splits fifteen other pages', () => {
    expect(routes).toMatch(/import Page1 from ['"]\.\.\/features\/projects\/Page['"]/);
    expect(routes).toMatch(/import Page13 from ['"]\.\.\/features\/atlas\/Page['"]/);
    for (const [index, [, feature]] of screens.entries()) {
      if (index === 0 || index === 1 || index === 13) continue;
      expect(routes, feature).toContain(
        `const Page${index}=lazy(()=>import('../features/${feature}/Page'))`,
      );
      expect(routes, feature).not.toMatch(new RegExp(
        `import\\s+Page${index}\\s+from\\s+['"]`,
      ));
    }
  });

  it('preserves all canonical paths and their Suspense and error boundaries', () => {
    expect((routes.match(/path: '/g) ?? [])).toHaveLength(screens.length);
    expect((routes.match(/errorElement: <RouteError\/>/g) ?? [])).toHaveLength(screens.length);
    expect((routes.match(/<Suspense fallback={<RouteFallback\/>}>/g) ?? [])).toHaveLength(screens.length);
    for (const [index, [path]] of screens.entries()) {
      expect(routes).toContain(`{path: '${path}', element:`);
      expect(routes).toContain(`<Page${index} />`);
    }
  });
});
