package io.github.mymayankyadav.lemma;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** E8 (v7 UX audit r3): phones are held in portrait; tablets and unfolded foldables rotate. */
public class OrientationPolicyTest {
    @Test public void phonesStayInPortrait() {
        assertEquals(OrientationPolicy.PORTRAIT, OrientationPolicy.requested(320));
        assertEquals(OrientationPolicy.PORTRAIT, OrientationPolicy.requested(360));
        assertEquals(OrientationPolicy.PORTRAIT, OrientationPolicy.requested(411));
        assertEquals(OrientationPolicy.PORTRAIT, OrientationPolicy.requested(599));
    }

    @Test public void tabletsAndUnfoldedFoldablesRotate() {
        assertEquals(OrientationPolicy.UNSPECIFIED, OrientationPolicy.requested(600));
        assertEquals(OrientationPolicy.UNSPECIFIED, OrientationPolicy.requested(673));
        assertEquals(OrientationPolicy.UNSPECIFIED, OrientationPolicy.requested(800));
    }

    @Test public void anUnknownWidthLocksNothing() {
        assertEquals(OrientationPolicy.UNSPECIFIED, OrientationPolicy.requested(0));
    }

    @Test public void theConstantsAreAndroids() {
        // ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED and SCREEN_ORIENTATION_PORTRAIT.
        assertEquals(-1, OrientationPolicy.UNSPECIFIED);
        assertEquals(1, OrientationPolicy.PORTRAIT);
    }
}
