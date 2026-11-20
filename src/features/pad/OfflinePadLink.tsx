import {useSyncExternalStore} from 'react';
import {devicePadSnapshot, findEligibleDevicePad, subscribeDevicePad} from './padCheckpoint';

export default function OfflinePadLink() {
  useSyncExternalStore(subscribeDevicePad, devicePadSnapshot);
  return findEligibleDevicePad() ? <a className="pointer-events-auto underline" href="#/pad">Open a saved Local Pad</a> : null;
}
