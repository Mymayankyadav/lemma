package io.github.mymayankyadav.lemma;

/**
 * E8 (v7 UX audit r3, Owner decision of 12 Nov 2026): phones stay in portrait until landscape is designed (the desk
 * clock and one-row headers); tablets and unfolded foldables rotate freely. "Phone" is Android's compact width class:
 * a smallest width under 600 dp. Pure, so it is unit-tested; MainActivity applies it on start and on every
 * configuration change (folding or unfolding changes the smallest width without recreating the activity).
 */
final class OrientationPolicy {
    /** Android's ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED and SCREEN_ORIENTATION_PORTRAIT. */
    static final int UNSPECIFIED = -1;
    static final int PORTRAIT = 1;
    static final int COMPACT_WIDTH_DP = 600;

    private OrientationPolicy() {}

    /** The orientation to request for a screen whose smallest width is {@code smallestWidthDp}. */
    static int requested(int smallestWidthDp) {
        return smallestWidthDp > 0 && smallestWidthDp < COMPACT_WIDTH_DP ? PORTRAIT : UNSPECIFIED;
    }
}
