/**
 * Feature flags. Every flag is typed here and OFF by default; a flag is on in production only when its
 * default below is changed in a reviewed PR.
 *
 * Overrides (dev, tests and e2e builds only; ignored in production builds):
 *   - URL:  `?flags=a,b`   (the query string, i.e. before the `#/route` part)
 *   - env:  `VITE_FLAGS=a,b`
 * An override is honoured only when `import.meta.env.DEV`, `MODE === 'test'` or
 * `VITE_ALLOW_FLAG_OVERRIDES=1` (set by the e2e web server). Unknown names are ignored.
 */
export const FLAG_DEFAULTS = {
  /** Placeholder used by tests to prove the mechanism; remove when the first real flag lands. */
  ciSelfTest: false,
  /** Android TWA shell remains opt-in until N7 is complete. */
  androidShell: false,
  /** Service-worker notification handling remains opt-in until N5 is complete. */
  notificationsPush: false,
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
    if (n in FLAG_DEFAULTS) out[n as FlagName] = true;
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
