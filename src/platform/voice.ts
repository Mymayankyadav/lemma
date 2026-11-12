/**
 * N123 · N4 voice capture: Android's own speech recogniser (the system dialog, so no microphone permission for Lemma).
 * The text goes through the Capture sheet's existing recogniser (dates, lengths, #path).
 */
import {useEffect, useState} from 'react';
import {isNative} from './native';

export function useNativeVoice(): {available: boolean; listen: () => Promise<string | null>} {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    let live = true;
    void import('./bridge').then(async ({lemmaNative}) => {
      const result = await (await lemmaNative()).voiceAvailable();
      if (live) setAvailable(result.available);
    }).catch(() => undefined);
    return () => {live = false;};
  }, []);
  return {
    available,
    listen: async () => {
      const {lemmaNative} = await import('./bridge');
      const {text} = await (await lemmaNative()).voiceRecognise({prompt: 'Say what to add'});
      return text?.trim() || null;
    },
  };
}
