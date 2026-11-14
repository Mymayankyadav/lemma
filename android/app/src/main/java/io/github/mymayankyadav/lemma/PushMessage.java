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
    public enum Kind { SHOW, CLEAR, IGNORE }

    public final Kind kind;
    public final TimerState state;
    public final String entryId;
    public final int version;

    private PushMessage(Kind kind, TimerState state, String entryId, int version) {
        this.kind = kind; this.state = state; this.entryId = entryId; this.version = version;
    }

    private static final PushMessage IGNORED = new PushMessage(Kind.IGNORE, null, "", 0);

    /** Anything that is not a well-formed timer message is ignored: a push must never crash the app or show nothing useful. */
    public static PushMessage parse(Map<String, String> data) {
        if (data == null || !"timer".equals(data.get("type"))) return IGNORED;
        String entryId = data.get("entryId");
        if (entryId == null || entryId.isEmpty()) return IGNORED;
        int version;
        try {
            version = Integer.parseInt(data.get("version"));
        } catch (NumberFormatException e) {
            return IGNORED;
        }
        String op = data.get("op");
        if ("clear".equals(op)) return new PushMessage(Kind.CLEAR, null, entryId, version);
        if (!"show".equals(op) || data.get("state") == null) return IGNORED;
        try {
            TimerState state = TimerState.fromJson(new JSONObject(data.get("state")));
            if (!state.entryId.equals(entryId)) return IGNORED;
            return new PushMessage(Kind.SHOW, state, entryId, state.version);
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
