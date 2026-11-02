import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

// Regression for FIX #632: the ST-0 cold Today budget must not parse the
// other fifteen noncritical route modules before the first meaningful goal paint.
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
  it('requests the initial Today module directly from HTML before React mounts', () => {
    const html=readFileSync('index.html','utf8');
    expect(html).toContain("import('/src/features/home/Page.tsx')");
    expect(html.indexOf('data-detail-route-preload')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });

  it('splits every page while retaining Cards warmup on Paths', () => {
    const paths=readFileSync('src/features/projects/Page.tsx','utf8');
    expect(paths).toContain("void import('../cards/Page').catch(()=>{})");
    for (const [index, [, feature]] of screens.entries()) {
      expect(routes, feature).toContain(
        `const Page${index}=lazy(()=>import('../features/${feature}/Page'))`,
      );
      expect(routes, feature).not.toContain(`import Page${index} from `);
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
