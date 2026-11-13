import {useEffect} from 'react';
import {useSettings} from '../../data/hooks';
import {setHapticsEnabled} from './haptics';

/** AW6: whether Lemma's Haptics switch is on (`settings.ui.haptics`, on by default), kept in step for `haptic()`. */
export function hapticsSetting(ui: Record<string, unknown> | null | undefined): boolean {
  return ui?.haptics !== false;
}
export function useHapticsSetting(): boolean {
  const settings = useSettings(), on = hapticsSetting(settings.data?.ui as Record<string, unknown> | undefined);
  useEffect(() => {setHapticsEnabled(on);}, [on]);
  return on;
}
