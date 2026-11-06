// v2.0 review policy: which PRs need an independent Approve before CI merges them (ci/review-required.json).
// Build work behind a default-off flag merges on Ready + green checks; review happens per feature in Harden.
import { matchesAny, readJson } from './lib.mjs';

/** Pure: lines added to src/flags.ts that set a flag default to true (`name: true`). */
export const flagsTurnedOn = (patch) => String(patch || '').split('\n').filter((l) => /^\+\s*[A-Za-z_$][\w$]*\s*:\s*true\b/.test(l)).map((l) => l.slice(1).trim());

/** Pure: { required, why } from the PR's files ([{ filename, patch }]) and the config. */
export function reviewRequired(files, cfg = readJson('ci/review-required.json')) {
  const why = [];
  const prod = (files || []).map((f) => f.filename).filter((f) => matchesAny(f, cfg.paths || []));
  if (prod.length) why.push(`it changes ${prod.slice(0, 3).map((f) => '`' + f + '`').join(', ')}${prod.length > 3 ? ' …' : ''}, which deploys to production on merge`);
  const flags = (files || []).find((f) => f.filename === cfg.flagsFile);
  const on = flags ? flagsTurnedOn(flags.patch) : [];
  if (on.length) why.push(`it turns a flag on by default (${on.map((l) => '`' + l + '`').join(', ')})`);
  return { required: why.length > 0, why };
}
