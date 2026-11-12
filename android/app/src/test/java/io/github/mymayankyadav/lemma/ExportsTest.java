package io.github.mymayankyadav.lemma;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** AW2 (v7 UX audit r3): the backup handed to the share sheet keeps a plain name and a known type. */
public class ExportsTest {
    @Test public void keepsAPlainBackupName() {
        assertEquals("lemma-backup-2026-11-12.json", Exports.safeName("lemma-backup-2026-11-12.json"));
    }

    @Test public void neverWritesOutsideTheExportsFolder() {
        assertEquals("files-x.json", Exports.safeName("../../files/x.json"));
        assertEquals("evil.json", Exports.safeName("/evil.json"));
        assertEquals("hidden", Exports.safeName(".hidden"));
        assertEquals("a-b-c.json", Exports.safeName("a/b\\c.json"));
    }

    @Test public void fallsBackWhenNothingIsLeft() {
        assertEquals(Exports.FALLBACK_NAME, Exports.safeName(null));
        assertEquals(Exports.FALLBACK_NAME, Exports.safeName(""));
        assertEquals(Exports.FALLBACK_NAME, Exports.safeName("../.."));
    }

    @Test public void capsTheLength() {
        assertEquals(Exports.MAX_NAME, Exports.safeName("x".repeat(300) + ".json").length());
    }

    @Test public void sendsOnlyKnownTypes() {
        assertEquals("application/json", Exports.mime("application/json"));
        assertEquals("text/markdown", Exports.mime("text/markdown"));
        assertEquals("application/json", Exports.mime("application/vnd.android.package-archive"));
        assertEquals("application/json", Exports.mime(null));
    }
}
