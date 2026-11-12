package io.github.mymayankyadav.lemma;

/**
 * AW2 (v7 UX audit r3, Owner decision E14): the rules for a file the web layer hands to Android's share sheet. Pure, so
 * it is unit-tested. The file is written under the app's cache ({@code cache/exports/}, shared through the existing
 * FileProvider) and only the newest export is kept there.
 */
final class Exports {
    static final String DIR = "exports";
    static final String FALLBACK_NAME = "lemma-backup.json";
    static final int MAX_NAME = 96;

    private Exports() {}

    /** A plain file name: letters, digits, '.', '-' and '_' only, never a path or a hidden file, at most 96 characters. */
    static String safeName(String name) {
        if (name == null) return FALLBACK_NAME;
        String plain = name.replaceAll("[^A-Za-z0-9._-]", "-").replaceAll("^[.-]+", "");
        if (plain.length() > MAX_NAME) plain = plain.substring(0, MAX_NAME);
        if (plain.isEmpty() || plain.matches("[.-]*")) return FALLBACK_NAME;
        return plain;
    }

    /** Only the types a Lemma export uses; anything else is sent as JSON, the backup's own type. */
    static String mime(String mime) {
        if ("application/json".equals(mime) || "text/plain".equals(mime) || "text/markdown".equals(mime) || "text/csv".equals(mime)) return mime;
        return "application/json";
    }
}
