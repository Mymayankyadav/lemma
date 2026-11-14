package io.github.mymayankyadav.lemma;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N164 · what a button on a server reminder (Later, Not today, Approve, Undo) does: it posts the signed token that came
 * with the message to the `push` function, which checks it and runs the one action it names. The token is the only
 * credential, so no session is needed. Plain Java, so the request body is unit-tested on the JVM.
 */
public final class NoticeActionClient {
    private NoticeActionClient() {}

    /** This project's own function (Supabase project yemqnhnztlbyxmjxidis); never taken from a message. */
    static final String URL = "https://yemqnhnztlbyxmjxidis.supabase.co/functions/v1/push";

    /** {"act":{"token":"..."}}; null when the token cannot be a token. Pure. */
    public static String body(String token) {
        if (token == null || token.length() < 44 || token.length() > 4096 || !token.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) return null;
        try {
            return new JSONObject().put("act", new JSONObject().put("token", token)).toString();
        } catch (JSONException impossible) {
            return null;
        }
    }

    /** True when the server accepted the action (HTTP 200: done, or already done). */
    public static boolean post(String token) {
        String body = body(token);
        if (body == null) return false;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(URL).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            return connection.getResponseCode() == 200;
        } catch (IOException offline) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
