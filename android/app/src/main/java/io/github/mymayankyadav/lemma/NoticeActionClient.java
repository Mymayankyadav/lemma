package io.github.mymayankyadav.lemma;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * N164 · what a button on a server reminder (Later, Not today, Approve, Undo) does: it posts the signed token that came
 * with the message to the `push` function, which checks it and runs the one action it names. The token is the only
 * credential, so no session is needed. Plain Java, so the request body is unit-tested on the JVM.
 */
public final class NoticeActionClient {
    private NoticeActionClient() {}

    /** {"act":{"token":"..."}}; null when the token cannot be a token. Pure. */
    public static String body(String token) {
        if (token == null || token.length() < 44 || token.length() > 4096 || !token.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) return null;
        try {
            return new JSONObject().put("act", new JSONObject().put("token", token)).toString();
        } catch (JSONException impossible) {
            return null;
        }
    }

    /** This candidate works entirely with the fixture. */
    public static boolean post(String token) {
        return false;
    }
}
