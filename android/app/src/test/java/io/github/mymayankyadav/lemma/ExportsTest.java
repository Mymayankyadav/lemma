package io.github.mymayankyadav.lemma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
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
            assertTrue(Exports.clearCache(dir, file -> {assertEquals(previous, file); assertTrue(file.exists());}));
            assertFalse(previous.exists());
        } finally {previous.delete(); dir.delete();}
    }
    @Test public void removesPrivateBytesEvenIfRevocationFailsAndNeverReusesTheSharedPath() throws IOException {
        File dir = Files.createTempDirectory("lemma-pad-exports").toFile();
        try {
            File previous = Exports.newFile(dir, "lemma-pad.html");
            Files.writeString(previous.toPath(), "first owner's private Pad");
            assertFalse(Exports.clearCache(dir, file -> {assertTrue(file.exists());throw new SecurityException("fixture");}));
            assertFalse(previous.exists());
            assertFalse(previous.getParentFile().exists());
            File next = Exports.newFile(dir, "lemma-pad.html");
            Files.writeString(next.toPath(), "another owner's Pad");
            assertNotEquals(previous.getAbsolutePath(), next.getAbsolutePath());
            assertEquals("lemma-pad.html", next.getName());
            assertFalse(previous.exists());
            assertTrue(Exports.clearCache(dir, file -> {assertEquals(next, file);assertTrue(file.exists());}));
            assertFalse(next.exists());
            assertEquals(0, dir.listFiles().length);
        } finally {Exports.clearCache(dir, file -> {});dir.delete();}
    }
    @Test public void reportsDeletionFailureAfterAttemptingToRevokeTheGrant() {
        final boolean[] revoked = {false};
        File undeletable = new File("fixture-file") {
            @Override public boolean isDirectory() {return false;}
            @Override public boolean delete() {return false;}
            @Override public boolean exists() {return true;}
        };
        File directory = new File("fixture-directory") {
            @Override public boolean exists() {return true;}
            @Override public File[] listFiles() {return new File[]{undeletable};}
        };
        assertFalse(Exports.clearCache(directory, file -> {assertEquals(undeletable,file);revoked[0]=true;}));
        assertTrue(revoked[0]);
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
