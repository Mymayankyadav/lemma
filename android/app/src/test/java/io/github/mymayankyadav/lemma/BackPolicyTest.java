package io.github.mymayankyadav.lemma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** AW8 (v7 UX audit r3): back on Today leaves Lemma running on every supported Android version. */
public class BackPolicyTest {
    @Test public void fromAndroid12TheSystemMovesTheAppToTheBack() {
        assertTrue(BackPolicy.systemLeavesRunning(31));
        assertTrue(BackPolicy.systemLeavesRunning(33));
        assertTrue(BackPolicy.systemLeavesRunning(36));
    }

    @Test public void beforeAndroid12LemmaKeepsItsOwnFallback() {
        assertFalse(BackPolicy.systemLeavesRunning(24));
        assertFalse(BackPolicy.systemLeavesRunning(30));
    }

    @Test public void theConstantIsAndroids() {
        // Build.VERSION_CODES.S.
        assertEquals(31, BackPolicy.ANDROID_12);
    }
}
