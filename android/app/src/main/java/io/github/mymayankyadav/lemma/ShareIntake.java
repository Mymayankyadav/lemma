package io.github.mymayankyadav.lemma;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N4 "Share to Lemma": text and links, or PDF/.tex/.md files. Files are copied into the app's cache (at most
 * 50 MB each, five at a time) so the web layer can read them; the cache folder is cleared on every new share.
 */
public final class ShareIntake {
    private ShareIntake() {}

    static final long MAX_BYTES = 50L * 1024 * 1024;
    private static final List<JSONObject> pending = new ArrayList<>();

    /** Whether a file is something Lemma can add as a source. Pure. */
    public static boolean acceptedFile(String name, String mime) {
        String n = name == null ? "" : name.toLowerCase(java.util.Locale.ROOT);
        String m = mime == null ? "" : mime.toLowerCase(java.util.Locale.ROOT);
        return m.equals("application/pdf") || m.equals("application/x-tex") || m.equals("text/x-tex") || m.equals("text/markdown")
            || m.equals("text/x-markdown") || n.endsWith(".pdf") || n.endsWith(".tex") || n.endsWith(".latex") || n.endsWith(".ltx")
            || n.endsWith(".md") || n.endsWith(".markdown");
    }

    /** A safe file name: no path separators or control characters, at most 120 characters. Pure. */
    public static String safeName(String name) {
        String base = name == null || name.trim().isEmpty() ? "shared" : name.trim();
        base = base.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        return base.length() > 120 ? base.substring(base.length() - 120) : base;
    }

    /** Capture a share intent; true when it was one. */
    public static boolean capture(Context context, Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        try {
            List<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) uris.addAll(list);
            } else {
                Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (uri != null) uris.add(uri);
            }
            JSONObject item;
            if (uris.isEmpty()) {
                CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                item = new JSONObject().put("kind", "text").put("text", text == null ? "" : text.toString()).put("subject", subject == null ? "" : subject);
            } else {
                item = new JSONObject().put("kind", "file").put("files", copy(context, uris, intent.getType()));
            }
            synchronized (pending) {
                pending.add(item);
            }
            LemmaNativePlugin.signal("shareReceived");
        } catch (Exception e) {
            // An unreadable share is dropped; the app shows nothing new.
        }
        return true;
    }

    public static JSONArray take() {
        JSONArray out = new JSONArray();
        synchronized (pending) {
            for (JSONObject item : pending) out.put(item);
            pending.clear();
        }
        return out;
    }

    private static JSONArray copy(Context context, List<Uri> uris, String type) throws Exception {
        File dir = new File(context.getCacheDir(), "shared");
        File[] old = dir.listFiles();
        if (old != null) for (File f : old) f.delete();
        dir.mkdirs();
        ContentResolver resolver = context.getContentResolver();
        JSONArray files = new JSONArray();
        for (Uri uri : uris.subList(0, Math.min(5, uris.size()))) {
            String name = "shared", mime = resolver.getType(uri);
            long size = -1;
            try (Cursor c = resolver.query(uri, new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    if (!c.isNull(0)) name = c.getString(0);
                    if (!c.isNull(1)) size = c.getLong(1);
                }
            }
            if (mime == null) mime = type;
            if (!acceptedFile(name, mime) || size > MAX_BYTES) continue;
            File target = new File(dir, UUID.randomUUID() + "-" + safeName(name));
            long written = 0;
            try (InputStream in = resolver.openInputStream(uri); OutputStream out = new FileOutputStream(target)) {
                if (in == null) continue;
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    written += read;
                    if (written > MAX_BYTES) break;
                    out.write(buffer, 0, read);
                }
            }
            if (written > MAX_BYTES || written == 0) {target.delete(); continue;}
            files.put(new JSONObject().put("path", target.getAbsolutePath()).put("name", safeName(name))
                .put("mime", mime == null ? "" : mime).put("size", written));
        }
        return files;
    }
}
