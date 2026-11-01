import { describe, expect, it, vi } from 'vitest';
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

  it('avoids a recursive walk of 5,000 generated note graphs while preserving their card dates', () => {
    const fixture = makeStressStore(JSON.parse(fixtureText) as DemoStore, 'stress');
    const reference = hydrateFixture(fixture, now, 'UTC');
    const owned = makeStressStore(JSON.parse(fixtureText) as DemoStore, 'stress');
    const entries = vi.spyOn(Object, 'entries');
    let result: DemoStore;
    let visited: number;
    try {
      result = hydrateFixture(owned, now, 'UTC', { takeOwnership: true });
      visited = entries.mock.calls.length;
    } finally {
      entries.mockRestore();
    }
    // S contains thousands of non-card records, but no need to visit every
    // generated note, card and state when only two date tokens need resolving.
    expect(visited).toBeLessThan(9000);
    expect(result.notes.length).toBe(reference.notes.length);
    expect(result.notes[0]).toEqual(reference.notes[0]);
    expect(result.notes[2]).toEqual(reference.notes[2]);
    expect(result.notes.at(-1)).toEqual(reference.notes.at(-1));
  });
  it('hydrates extreme checkpoint and source timestamps without recursively walking every generated record', () => {
    const input=()=>makeStressStore(JSON.parse(fixtureText) as DemoStore,'extreme',{
      deferNotes:true,deferSessions:true,deferAtlas:true,
    });
    const expected=hydrateFixture(input(),now,'UTC');
    const owned=input();
    const entries=vi.spyOn(Object,'entries');
    let actual:DemoStore;
    let visited:number;
    try {
      actual=hydrateFixture(owned,now,'UTC',{takeOwnership:true});
      visited=entries.mock.calls.length;
    } finally {
      entries.mockRestore();
    }
    // The 60x100 checkpoints and 60x100 sources remain complete, including
    // hydrated dates, but their immutable strings/arrays need no deep walk.
    expect(visited).toBeLessThan(5000);
    expect(actual.checkpoints).toEqual(expected.checkpoints);
    expect(actual.sources).toEqual(expected.sources);
  });

});
