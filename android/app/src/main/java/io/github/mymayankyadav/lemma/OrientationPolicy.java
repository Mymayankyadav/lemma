package io.github.mymayankyadav.lemma;

/**
 * N159 (Owner release of 13 Nov 2026): the desk clock and landscape layouts now ship, so phones, tablets and
 * unfolded foldables follow the system rotation setting. MainActivity applies this on start and configuration
 * changes; the pure policy keeps the former compact-width boundaries covered by unit tests.
 */
final class OrientationPolicy {
    /** Android's ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED and SCREEN_ORIENTATION_PORTRAIT. */
    static final int UNSPECIFIED = -1;
    static final int PORTRAIT = 1;
    static final int COMPACT_WIDTH_DP = 600;

    private OrientationPolicy() {}

    /** The orientation to request for a screen whose smallest width is {@code smallestWidthDp}. */
    static int requested(int smallestWidthDp) {
        return UNSPECIFIED;
    }
}
