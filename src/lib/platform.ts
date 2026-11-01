/** Platform signals are advisory UI hints, never an authentication boundary. */
const twaOrigin = 'android-app://io.github.mymayankyadav.lemma'
const twaVisitKey = 'lemma:twa-visit'

/** Android supplies the package referrer on the first TWA navigation only. */
export function isTwa(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  const referrer = document.referrer
  const fromTwa = referrer === twaOrigin || referrer.startsWith(twaOrigin + '/')
  try {
    if (fromTwa) window.sessionStorage.setItem(twaVisitKey, '1')
    return fromTwa || window.sessionStorage.getItem(twaVisitKey) === '1'
  } catch {
    // Storage may be blocked; the first navigation still has its referrer.
    return fromTwa
  }
}

/** A browser-installed PWA is standalone even when it is not an Android TWA. */
export function isStandalone(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
}

/** 'yes' means supported and eligible to ask, not that permission was granted. */
export function pushSupport(): 'yes' | 'blocked' | 'unsupported' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' ||
      !('PushManager' in window) || !('serviceWorker' in navigator) ||
      !('Notification' in window)) return 'unsupported'
  return window.Notification.permission === 'denied' ? 'blocked' : 'yes'
}
