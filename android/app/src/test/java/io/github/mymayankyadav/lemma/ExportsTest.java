package io.github.mymayankyadav.lemma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.junit.Test;

/** AW2 (v7 UX audit r3): the backup handed to the share sheet keeps a plain name and a known type. */
public class ExportsTest {
    @Test public void revokesTheOldUriBeforeRemovingTheCachedFile() throws IOException {
        File dir = Files.createTempDirectory("lemma-pad-exports").toFile();
        File previous = new File(dir, "lemma-pad.html");
        try {
            assertTrue(previous.createNewFile());
            assertFalse(Exports.clearCache(dir, file -> {throw new SecurityException("fixture");}));
            assertTrue(previous.exists());
            assertTrue(Exports.clearCache(dir, file -> {assertEquals(previous, file); assertTrue(file.exists());}));
            assertFalse(previous.exists());
        } finally {previous.delete(); dir.delete();}
    }
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
        assertEquals("text/html", Exports.mime("text/html"));
        assertEquals("application/json", Exports.mime("application/vnd.android.package-archive"));
        assertEquals("application/json", Exports.mime(null));
    }
}
