/** N123 · pulses of a v7 haptic pattern as system haptics (odd entries are pauses); respects the system setting. */
export async function nativeHaptic(pattern: number | number[]): Promise<void> {
  try {
    const {Haptics, ImpactStyle} = await import('@capacitor/haptics');
    const steps = Array.isArray(pattern) ? pattern : [pattern];
    for (let i = 0; i < steps.length; i++) {
      if (i % 2) { await new Promise(resolve => setTimeout(resolve, steps[i])); continue; }
      await Haptics.impact({style: steps[i] >= 15 ? ImpactStyle.Medium : ImpactStyle.Light});
    }
  } catch { /* haptics are a nicety */ }
}
