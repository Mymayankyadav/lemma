/**
 * N131 · A5 optional sounds, off by default (Settings › Appearance › Sounds): a pencil tick when a card is graded, a
 * page turn when a round completes, a low chime when the day is closed. Each is synthesised here (no audio files, so
 * zero bytes), lasts at most 200 ms and is quiet. Browsers may decline audio before a gesture; that is never an error.
 */
export type SoundKind = 'tick' | 'page' | 'chime';
/** Each sound's length in seconds (all ≤ 0.2, the plan's budget). */
export const SOUND_SECONDS: Readonly<Record<SoundKind, number>> = {tick: .04, page: .18, chime: .2};

type Audio = typeof AudioContext;
let shared: AudioContext | null = null;
function context(AudioCtor: Audio | undefined): AudioContext | null {
  if (!AudioCtor) return null;
  try {shared ??= new AudioCtor();} catch {return null;}
  return shared;
}
/** White noise, `seconds` long, for the pencil and paper sounds. */
function noise(audio: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = audio.createBuffer(1, Math.max(1, Math.ceil(audio.sampleRate * seconds)), audio.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < data.length; i++) {seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1;}
  const source = audio.createBufferSource();
  source.buffer = buffer;
  return source;
}

export async function playSound(kind: SoundKind, enabled: boolean,
  AudioCtor: Audio | undefined = typeof AudioContext === 'undefined' ? undefined : AudioContext): Promise<boolean> {
  if (!enabled) return false;
  const audio = context(AudioCtor);
  if (!audio) return false;
  try {
    if (audio.state === 'suspended') await audio.resume();
    const now = audio.currentTime, length = SOUND_SECONDS[kind], gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(.0001, now);
    if (kind === 'chime') {
      // A low chime: a fifth (220 and 330 Hz), soft attack, quick decay.
      gain.gain.exponentialRampToValueAtTime(.06, now + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      for (const frequency of [220, 330]) {
        const tone = audio.createOscillator();
        tone.type = 'sine'; tone.frequency.setValueAtTime(frequency, now);
        tone.connect(gain); tone.start(now); tone.stop(now + length);
      }
    } else {
      // Pencil tick: a short high band of noise. Page turn: a band sweeping down, like paper.
      const source = noise(audio, length), filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(kind === 'tick' ? 4200 : 2600, now);
      if (kind === 'page') filter.frequency.exponentialRampToValueAtTime(900, now + length);
      filter.Q.setValueAtTime(kind === 'tick' ? 1.2 : .7, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'tick' ? .12 : .05, now + (kind === 'tick' ? .004 : .03));
      gain.gain.exponentialRampToValueAtTime(.0001, now + length);
      source.connect(filter); filter.connect(gain); source.start(now); source.stop(now + length);
    }
    return true;
  } catch {
    return false;
  }
}
/** Whether the learner turned sounds on (settings.ui.sounds). */
export const soundsOn = (ui: {[key: string]: unknown} | null | undefined) => ui?.sounds === true;
