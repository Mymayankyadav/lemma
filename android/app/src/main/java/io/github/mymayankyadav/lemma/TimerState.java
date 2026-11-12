package io.github.mymayankyadav.lemma;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N2 what the native focus timer shows. It mirrors the server study entry (sent by the web layer after every
 * change) and can apply the user's lock-screen action optimistically until the web layer re-syncs from the server.
 * Pure Java (org.json only), so it is unit-tested on the JVM.
 */
public final class TimerState {
    public static final String RUNNING = "running";
    public static final String PAUSED = "paused";
    public static final String BREAK = "break";

    public String entryId = "";
    public int version;
    public String status = RUNNING;
    public String intention = "";
    public String context = "";
    public String mode = "open";
    public long focusedMs;
    public long asOf;
    public long phaseEndsAt;
    public long phaseMs;
    public int cycle = 1;
    public int cycles = 4;
    public int breakMinutes = 5;
    public int focusMinutes = 25;
    public boolean clock24h = true;
    /** Set when the user acted on the lock screen and the server has not confirmed it yet. */
    public boolean unsynced;

    public static TimerState fromJson(JSONObject json) throws JSONException {
        TimerState s = new TimerState();
        s.entryId = json.getString("entryId");
        s.version = json.optInt("version", 0);
        s.status = json.optString("status", RUNNING);
        if (!RUNNING.equals(s.status) && !PAUSED.equals(s.status) && !BREAK.equals(s.status)) throw new JSONException("status");
        s.intention = json.optString("intention", "Focused study");
        s.context = json.optString("context", "");
        s.mode = json.optString("mode", "open");
        s.focusedMs = Math.max(0, json.optLong("focusedMs", 0));
        s.asOf = json.optLong("asOf", System.currentTimeMillis());
        s.phaseEndsAt = Math.max(0, json.optLong("phaseEndsAt", 0));
        s.phaseMs = Math.max(0, json.optLong("phaseMs", 0));
        s.cycle = Math.max(1, json.optInt("cycle", 1));
        s.cycles = Math.max(1, json.optInt("cycles", 4));
        s.breakMinutes = Math.max(1, json.optInt("breakMinutes", 5));
        s.focusMinutes = Math.max(1, json.optInt("focusMinutes", 25));
        s.clock24h = json.optBoolean("clock24h", true);
        s.unsynced = json.optBoolean("unsynced", false);
        return s;
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("entryId", entryId).put("version", version).put("status", status).put("intention", intention)
                .put("context", context).put("mode", mode).put("focusedMs", focusedMs).put("asOf", asOf)
                .put("phaseEndsAt", phaseEndsAt).put("phaseMs", phaseMs).put("cycle", cycle).put("cycles", cycles)
                .put("breakMinutes", breakMinutes).put("focusMinutes", focusMinutes).put("clock24h", clock24h)
                .put("unsynced", unsynced);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
        return json;
    }

    public boolean timed() { return phaseEndsAt > 0 && !PAUSED.equals(status); }

    /** Focused time at `now`: it grows only while running outside a break. */
    public long focusedAt(long now) {
        return RUNNING.equals(status) ? focusedMs + Math.max(0, now - asOf) : focusedMs;
    }

    /** The optimistic state after a lock-screen action, or null when the action does not apply in this state. */
    public TimerState after(String action, long now) {
        TimerState next = copy();
        next.focusedMs = focusedAt(now);
        next.asOf = now;
        next.unsynced = true;
        switch (action) {
            case "pause":
                if (!RUNNING.equals(status)) return null;
                next.status = PAUSED;
                next.phaseEndsAt = 0;
                next.phaseMs = 0;
                return next;
            case "resume":
                if (RUNNING.equals(status)) return null;
                next.status = RUNNING;
                if ("pomodoro".equals(mode)) {
                    next.phaseMs = focusMinutes * 60_000L;
                    next.phaseEndsAt = now + next.phaseMs;
                } else {
                    next.phaseEndsAt = 0;
                    next.phaseMs = 0;
                }
                return next;
            case "break":
                if (!RUNNING.equals(status)) return null;
                next.status = BREAK;
                next.phaseMs = breakMinutes * 60_000L;
                next.phaseEndsAt = now + next.phaseMs;
                return next;
            default:
                return null;
        }
    }

    public TimerState copy() {
        try {
            return fromJson(toJson());
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
