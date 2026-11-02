import type {NotifyPrefs} from './types'

/** Preserve unknown future reminder keys on a partial settings update. */
export function mergeNotifyPrefs(before:NotifyPrefs|null|undefined,patch:NotifyPrefs):NotifyPrefs {
 const old=before??{}
 return {
  ...old,...patch,
  ...(patch.kinds?{kinds:{...old.kinds,...patch.kinds}}:{}),
  ...(patch.quiet?{quiet:{...old.quiet,...patch.quiet}}:{}),
  ...(patch.digest?{digest:{...old.digest,...patch.digest}}:{}),
  ...(patch.backoff?{backoff:{...old.backoff,...patch.backoff}}:{}),
 }
}
