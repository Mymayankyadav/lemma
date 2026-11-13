package io.github.mymayankyadav.lemma;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** AW1 (E5): the system font size, capped at 200%. */
public class TextZoomPolicyTest {
    @Test public void followsTheSystemFontScale() {
        assertEquals(100, TextZoomPolicy.textZoom(1.0f));
        assertEquals(115, TextZoomPolicy.textZoom(1.15f));
        assertEquals(130, TextZoomPolicy.textZoom(1.3f));
        assertEquals(200, TextZoomPolicy.textZoom(2.0f));
    }

    @Test public void isCappedAt200AndNeverSmallerThanTheDesign() {
        assertEquals(200, TextZoomPolicy.textZoom(2.4f));
        assertEquals(100, TextZoomPolicy.textZoom(0.85f));
        assertEquals(100, TextZoomPolicy.textZoom(0f));
        assertEquals(100, TextZoomPolicy.textZoom(Float.NaN));
    }
}
