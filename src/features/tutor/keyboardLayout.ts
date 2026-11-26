import {useSyncExternalStore} from 'react';
import {isNative} from '../../platform/native';
import {isIPadBrowser} from '../../platform/ipad';

/**
 * N252 (Owner: "keyboard layout should depend on the device. Keep the current layout for android devices") · which
 * keyboard the tutor draws. `ipad` follows iPadOS's own full-size keyboard; everywhere else (the Android app, Android
 * and other phones, desktops) keeps Gboard's layout (N220/N221).
 */
export type KeyboardLayout = 'gboard' | 'ipad';

/** iPadOS itself switches to its phone keyboard in a narrow window (Slide Over, a narrow Split View); so does Lemma. */
export const IPAD_KEYBOARD_MIN_WIDTH = 600;
const WIDE = `(min-width: ${IPAD_KEYBOARD_MIN_WIDTH}px)`;

type Device = Pick<Navigator, 'platform' | 'userAgent' | 'maxTouchPoints'>;

/** The layout for a device and window: the iPad keyboard only on an iPad (including desktop-mode Safari) in a wide window. */
export function keyboardLayoutFor(device: Device, wide: boolean, nativeApp = false): KeyboardLayout {
  return !nativeApp && wide && isIPadBrowser(device) ? 'ipad' : 'gboard';
}

function subscribe(listener: () => void) {
  if (typeof matchMedia !== 'function') return () => undefined;
  const query = matchMedia(WIDE);
  query.addEventListener?.('change', listener);
  return () => query.removeEventListener?.('change', listener);
}
const isWide = () => typeof matchMedia !== 'function' || matchMedia(WIDE).matches;

/** The tutor keyboard's layout, following the window's width as it changes (rotation, Split View). */
export function useKeyboardLayout(): KeyboardLayout {
  const wide = useSyncExternalStore(subscribe, isWide, () => true);
  if (typeof navigator === 'undefined') return 'gboard';
  return keyboardLayoutFor(navigator, wide, isNative() || document.documentElement.hasAttribute('data-native-app'));
}
