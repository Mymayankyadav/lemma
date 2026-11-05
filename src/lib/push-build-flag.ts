/** Workbox bundling follows the reviewed production flag default plus explicit test overrides. */
export function shouldBundlePushWorker(defaultEnabled: boolean, allowOverrides: boolean, envFlags: string): boolean {
 return defaultEnabled || (allowOverrides && envFlags.split(',').some(flag => flag.trim() === 'notificationsPush'));
}
