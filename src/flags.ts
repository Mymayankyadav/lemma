/**
 * Feature flags. Every flag is typed here and OFF by default; a flag is on in production only when its
 * default below is changed in a reviewed PR.
 *
 * Overrides (dev, tests and e2e builds only; ignored in production builds):
 *   - URL:  `?flags=a,b`   (the query string, i.e. before the `#/route` part)
 *   - env:  `VITE_FLAGS=a,b`
 * A plain name turns the flag on; a name with a leading `-` turns it off (`?flags=-v6Shell`), which is how
 * tests and e2e builds exercise a flag's off path once its default is on. Env flags apply first, the URL last.
 * An override is honoured only when `import.meta.env.DEV`, `MODE === 'test'` or
 * `VITE_ALLOW_FLAG_OVERRIDES=1` (set by the e2e web server). Unknown names are ignored. Production builds
 * never honour overrides, so rolling a flag back there is a reviewed PR that changes its default.
 */
export const FLAG_DEFAULTS = {
  /** Placeholder used by tests to prove the mechanism; remove when the first real flag lands. */
  ciSelfTest: false,
  /** Android TWA shell remains opt-in until N7 is complete. */
  androidShell: false,
  /** Service-worker notification handling remains opt-in until N5 is complete. */
  notificationsPush: false,
  /** v6 navigation, screens and shared shell (default on since N102; `?flags=-v6Shell` shows the legacy app in dev/test/e2e builds). */
  v6Shell: true,
  /** Constellation, on by default since the Owner's release of 12 Nov 2026 (release gates waived by the Owner). v6Shell
   *  stays on underneath it as the rollback: changing this default back to false restores v6 with no data change. */
  v7Shell: true,
  /** N131 · A4 the focus orbit (an SVG prototype, plan r3 §7): open-mode sessions trace a ring once a minute; paused and drifted states show on it. */
  focusOrbit: false,
  /** N157 · U1 S11 the margin: a 292 px notes column beside Path, Checkpoint, Session, Card and Review (a sheet below 1100 px). */
  v7Margin: false,
  /** N157 · U1 V09 / U4 S5 Review as an open notebook: from 840 px (and in book posture) question left, answer right. */
  v7Spread: false,
  /** N157 · U4 S1 the ruler: Today's day as a ruler with a needle for now (a slider with spoken times). */
  v7Ruler: false,
  /** N157 · U4 S2–S4 the ∎ as the one ending: a task's tick becomes the square; Close the day as one page (V25). */
  v7Qed: false,
  /** N157 · U4 S6 scratch paper: a sheet of graph paper for an attempt before the reveal; nothing is stored. */
  v7Scratch: false,
  /** N157 · U4 S14 paper and sky: Plain, Graph, Dot or Ruled paper by day; Clear or Stars by night. */
  v7Paper: false,
  /** N157 · U4 S16 desk clock: Focus as large digits, the intention and a ring; the screen stays awake while it runs. */
  v7DeskClock: false,
  /** N157 · U4 S15 the week page: the weekly digest as a page (/week), the Sunday notification's destination. */
  v7Week: false,
} as const satisfies Record<string, boolean>;

export type FlagName = keyof typeof FLAG_DEFAULTS;

export type FlagEnv = {
  /** Whether overrides may apply at all (false in production builds). */
  allowOverrides: boolean;
  /** Raw `search` string, e.g. `?demo=1&flags=a,b`. */
  search?: string;
  /** Comma separated names from VITE_FLAGS. */
  envFlags?: string;
};

function names(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/** Resolve all flags for the given environment. Pure, so it is unit-testable. */
export function resolveFlags(env: FlagEnv): Record<FlagName, boolean> {
  const out: Record<FlagName, boolean> = { ...FLAG_DEFAULTS };
  if (!env.allowOverrides) return out;
  const fromQuery = names(new URLSearchParams(env.search ?? '').get('flags'));
  for (const n of [...names(env.envFlags), ...fromQuery]) {
    const off = n.startsWith('-');
    const name = off ? n.slice(1) : n;
    if (name in FLAG_DEFAULTS) out[name as FlagName] = !off;
  }
  return out;
}

function currentEnv(): FlagEnv {
  const meta = import.meta.env;
  const allow = Boolean(meta.DEV) || meta.MODE === 'test' || meta.VITE_ALLOW_FLAG_OVERRIDES === '1';
  return {
    allowOverrides: allow,
    search: typeof window === 'undefined' ? '' : window.location.search,
    envFlags: typeof meta.VITE_FLAGS === 'string' ? meta.VITE_FLAGS : '',
  };
}

export function isFlagOn(name: FlagName): boolean {
  return resolveFlags(currentEnv())[name];
}

/** Select one visual shell without changing the independently resolved flags. */
export type EffectiveShell = 'v7' | 'v6' | 'legacy';
export function resolveEffectiveShell(flags: Pick<Record<FlagName, boolean>, 'v6Shell' | 'v7Shell'>): EffectiveShell {
  return flags.v7Shell ? 'v7' : flags.v6Shell ? 'v6' : 'legacy';
}

export function currentEffectiveShell(): EffectiveShell {
  return resolveEffectiveShell(resolveFlags(currentEnv()));
}
