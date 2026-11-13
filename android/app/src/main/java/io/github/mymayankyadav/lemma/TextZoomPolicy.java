package io.github.mymayankyadav.lemma;

/**
 * AW1 (v7 UX audit r3, Owner decision E5 of 12 Nov 2026): the app honours the system font size, capped at 200%. The
 * WebView's text zoom is set from the system's font scale (Settings › Display › Font size), never below 100% and
 * never above 200%, which the web layer's large-text layouts are built and linted for (V11, N134, N157). Pure, so it is
 * unit-tested; MainActivity applies it on start and when the font scale changes.
 */
final class TextZoomPolicy {
    static final int MIN = 100;
    static final int MAX = 200;

    private TextZoomPolicy() {}

    /** The WebView text zoom (percent) for a system font scale such as 1.0, 1.3 or 2.0. */
    static int textZoom(float fontScale) {
        if (Float.isNaN(fontScale) || fontScale <= 0f) return MIN;
        int percent = Math.round(fontScale * 100f);
        return Math.max(MIN, Math.min(MAX, percent));
    }
}
