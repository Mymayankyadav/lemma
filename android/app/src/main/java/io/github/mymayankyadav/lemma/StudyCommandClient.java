package io.github.mymayankyadav.lemma;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N2 lock-screen timer actions call the same `study_command` the web app calls, with the signed-in user's
 * short-lived access token and the publishable key (RLS applies exactly as in the browser). `expectedVersion` makes a
 * repeated or stale action a conflict instead of a double write. No refresh token is ever held here.
 */
public final class StudyCommandClient {
    private StudyCommandClient() {}

    public static final int TIMEOUT_MS = 8_000;

    /** The RPC body for one study-entry operation. Pure. */
    public static JSONObject body(String operation, String entryId, int expectedVersion, String operationId) throws JSONException {
        JSONObject envelope = new JSONObject()
            .put("operationId", operationId)
            .put("schemaVersion", 1)
            .put("resource", "study_entries")
            .put("operation", operation)
            .put("target", new JSONObject().put("id", entryId))
            .put("expectedVersion", expectedVersion)
            .put("patch", new JSONObject());
        return new JSONObject().put("p", envelope);
    }

    /** The new version from an `ok` receipt, or -1 for a conflict or anything unexpected. Pure. */
    public static int newVersion(String response) {
        try {
            JSONObject receipt = new JSONObject(response);
            if (!"ok".equals(receipt.optString("status"))) return -1;
            JSONArray changed = receipt.optJSONArray("changed");
            if (changed == null || changed.length() < 1) return -1;
            return changed.getJSONObject(0).optInt("version", -1);
        } catch (JSONException e) {
            return -1;
        }
    }

    /** Whether a session can be used now (with a 30-second margin before expiry). Pure. */
    public static boolean usable(SessionStore.Session session, long now) {
        return session != null && session.url.startsWith("https://") && !session.accessToken.isEmpty() && session.expiresAt > now + 30_000L;
    }

    /** Run one operation; returns the new version or -1. Never throws for network or server errors. */
    public static int run(SessionStore.Session session, String operation, String entryId, int expectedVersion) {
        HttpURLConnection connection = null;
        try {
            byte[] payload = body(operation, entryId, expectedVersion, UUID.randomUUID().toString()).toString().getBytes(StandardCharsets.UTF_8);
            connection = (HttpURLConnection) new URL(session.url.replaceAll("/+$", "") + "/rest/v1/rpc/study_command").openConnection();
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", session.key);
            connection.setRequestProperty("Authorization", "Bearer " + session.accessToken);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(payload);
            }
            if (connection.getResponseCode() / 100 != 2) return -1;
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int read;
                while ((read = in.read(chunk)) != -1 && buffer.size() < 256 * 1024) buffer.write(chunk, 0, read);
                return newVersion(buffer.toString(StandardCharsets.UTF_8.name()));
            }
        } catch (IOException | JSONException | RuntimeException e) {
            return -1;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
