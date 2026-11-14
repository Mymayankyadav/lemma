package io.github.mymayankyadav.lemma;

import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N163 · what an FCM data message from the `push` server function asks the phone to do with its timer notification:
 * show or replace it, clear it, or nothing. Pure Java (org.json only), so it is unit-tested on the JVM; the Firebase
 * class that receives the message is a few lines around it.
 *
 * The message is `{type: "timer", op: "show" | "clear", entryId, version, state?}` with every value a string. The state
 * is the same JSON the web layer sends to `timerUpdate`.
 */
public final class PushMessage {
    public enum Kind { SHOW, CLEAR, NOTICE, IGNORE }

    public final Kind kind;
    public final TimerState state;
    public final String entryId;
    public final int version;
    /** For NOTICE: the reminder in the shape `Reminders.post` shows (id, title, body, route, channel, actions). */
    public final JSONObject notice;

    private PushMessage(Kind kind, TimerState state, String entryId, int version, JSONObject notice) {
        this.kind = kind; this.state = state; this.entryId = entryId; this.version = version; this.notice = notice;
    }

    private static final PushMessage IGNORED = new PushMessage(Kind.IGNORE, null, "", 0, null);

    /** The in-app route of a notice link: "#/review" or "/lemma/#/review" or the App Link become "/review"; anything else is null. Pure. */
    public static String routeOf(String url) {
        if (url == null || url.length() > 2048) return null;
        int hash = url.indexOf("#/");
        if (hash < 0) return null;
        boolean local = hash == 0 || url.startsWith("/lemma/#/") || url.startsWith("https://mymayankyadav.github.io/lemma/#/");
        return local ? url.substring(hash + 1) : null;
    }

    /**
     * The buttons of a notice, at most two, in the shape `Reminders.post` shows: a link into the app becomes `open`; a
     * signed token (server-checked when tapped) becomes its action. Anything else is dropped; with none, one Open button.
     */
    static org.json.JSONArray buttons(String raw, String fallbackRoute) throws JSONException {
        org.json.JSONArray out = new org.json.JSONArray();
        if (raw != null) {
            try {
                org.json.JSONArray list = new org.json.JSONArray(raw);
                for (int i = 0; i < list.length() && out.length() < 2; i++) {
                    JSONObject item = list.optJSONObject(i);
                    if (item == null) continue;
                    String action = item.optString("action"), title = item.optString("title"), token = item.optString("token", null), route = routeOf(item.optString("url", null));
                    if (title.isEmpty() || title.length() > 40 || !action.matches("[a-z][a-z0-9_]{0,31}")) continue;
                    if ("open".equals(action) && route != null) out.put(new JSONObject().put("id", "open").put("label", title).put("route", route));
                    else if (!"open".equals(action) && NoticeActionClient.body(token) != null) out.put(new JSONObject().put("id", action).put("label", title).put("token", token));
                }
            } catch (JSONException malformed) {
                out = new org.json.JSONArray();
            }
        }
        if (out.length() == 0) out.put(new JSONObject().put("id", "open").put("label", "Open").put("route", fallbackRoute));
        return out;
    }

    private static PushMessage notice(Map<String, String> data) {
        String id = data.get("id"), title = data.get("title"), body = data.get("body"), route = routeOf(data.get("url"));
        if (id == null || !id.matches("[1-9][0-9]{0,18}") || title == null || title.trim().isEmpty() || title.length() > 200
            || body == null || body.length() > 600 || route == null) return IGNORED;
        try {
            org.json.JSONArray actions = buttons(data.get("actions"), route);
            JSONObject item = new JSONObject().put("id", "push-" + id).put("title", title).put("body", body).put("route", route)
                .put("channel", "review").put("publicTitle", "Lemma").put("actions", actions);
            return new PushMessage(Kind.NOTICE, null, "", 0, item);
        } catch (JSONException impossible) {
            return IGNORED;
        }
    }

    /** Anything that is not a well-formed timer message is ignored: a push must never crash the app or show nothing useful. */
    public static PushMessage parse(Map<String, String> data) {
        if (data == null) return IGNORED;
        if ("notice".equals(data.get("type"))) return notice(data);
        if (!"timer".equals(data.get("type"))) return IGNORED;
        String entryId = data.get("entryId");
        if (entryId == null || entryId.isEmpty()) return IGNORED;
        int version;
        try {
            version = Integer.parseInt(data.get("version"));
        } catch (NumberFormatException e) {
            return IGNORED;
        }
        String op = data.get("op");
        if ("clear".equals(op)) return new PushMessage(Kind.CLEAR, null, entryId, version, null);
        if (!"show".equals(op) || data.get("state") == null) return IGNORED;
        try {
            TimerState state = TimerState.fromJson(new JSONObject(data.get("state")));
            if (!state.entryId.equals(entryId)) return IGNORED;
            return new PushMessage(Kind.SHOW, state, entryId, state.version, null);
        } catch (JSONException e) {
            return IGNORED;
        }
    }

    /**
     * Whether to act on it, given the timer the phone shows now (null for none). Messages can arrive late or out of order,
     * and a lock-screen action not yet sent to the server is newer than the server's last word:
     *  - show: another entry always replaces; the same entry only with a newer version (or the same one when nothing here
     *    is waiting to be sent);
     *  - clear: only the entry that is showing, and only if the server's version is not older.
     */
    public boolean appliesTo(TimerState current) {
        switch (kind) {
            case NOTICE:
                return true;
            case SHOW:
                if (current == null || !current.entryId.equals(entryId)) return true;
                if (version > current.version) return true;
                return version == current.version && !current.unsynced;
            case CLEAR:
                return current != null && current.entryId.equals(entryId) && version >= current.version;
            default:
                return false;
        }
    }
}
