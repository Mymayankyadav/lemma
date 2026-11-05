/** A URL flag cannot be known at build time; override-capable builds include an inert worker. */
export function shouldBundlePushWorker(defaultEnabled: boolean, allowOverrides: boolean): boolean {
 return defaultEnabled || allowOverrides;
}

/** The ordinary production default or a build-time env override starts listeners immediately. */
export function shouldStartPushWorker(defaultEnabled: boolean, allowOverrides: boolean, envFlags: string): boolean {
 return defaultEnabled || (allowOverrides && envFlags.split(',').some(flag => flag.trim() === 'notificationsPush'));
}
