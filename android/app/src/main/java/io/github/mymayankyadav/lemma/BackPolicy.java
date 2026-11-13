package io.github.mymayankyadav.lemma;

/**
 * AW8 (v7 UX audit r3): on Today with nothing open, the web layer releases the back gesture so Android plays its own
 * back-to-home preview. From Android 12 (API 31) the system then moves a root activity to the back, as Lemma's handler
 * did with minimizeApp. Before Android 12 it would finish the activity, so the next open would start cold;
 * MainActivity adds a fallback there that moves the task to the back instead. Pure, so it is unit-tested.
 */
final class BackPolicy {
    /** Build.VERSION_CODES.S, Android 12. */
    static final int ANDROID_12 = 31;

    private BackPolicy() {}

    /** Whether Android leaves a root activity running on back at this API level, so no fallback is needed. */
    static boolean systemLeavesRunning(int sdk) {
        return sdk >= ANDROID_12;
    }
}
