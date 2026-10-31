import { describe, expect, it } from 'vitest';
import fixtureText from '../../../src/data/demo/fixture.json?raw';
import { DemoAdapter } from '../../../src/data/demo/adapter';
import { hydrateFixture } from '../../../src/data/demo/hydrate';
import { makeStressStore } from '../../../src/data/demo/stress';
import type { DemoStore } from '../../../src/data/demo/model';

const now = Date.UTC(2026, 9, 31, 12);

describe('stress fixture ownership', () => {
  it('keeps the normal caller-owned fixture immutable', () => {
    const fixture = JSON.parse(fixtureText) as DemoStore;
    const original = JSON.stringify(fixture);
    const hydrated = hydrateFixture(fixture, now, 'UTC');
    expect(hydrated).not.toBe(fixture);
    expect(JSON.stringify(fixture)).toBe(original);
  });

  it('hydrates a freshly generated private stress fixture without cloning it again', async () => {
    const fixture = makeStressStore(JSON.parse(fixtureText) as DemoStore, 'stress');
    const unresolvedDue = fixture.notes[0].cards[0].state.due;
    const hydrated = hydrateFixture(fixture, now, 'UTC', { takeOwnership: true });
    expect(hydrated).toBe(fixture);
    expect(hydrated.notes[0].cards[0].state.due).not.toBe(unresolvedDue);
    expect(hydrated.notes).toHaveLength(5000);

    const owned = makeStressStore(JSON.parse(fixtureText) as DemoStore, 'stress');
    const adapter = new DemoAdapter({ fixture: owned, ownedFixture: true, now: () => now, timeZone: 'UTC' });
    const home = await adapter.getHome();
    expect(home.projects).toHaveLength(15);
    expect(home.due).toBe(600);
  });
});
