package io.github.mymayankyadav.lemma;

import static org.junit.Assert.*;

import java.util.HashMap;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

/** N163 · what a push message asks of the timer notification, and when the phone ignores it. */
public class PushMessageTest {
    static String state(String id, int version, String status) throws JSONException {
        return new JSONObject().put("entryId", id).put("version", version).put("status", status).put("intention", "Algebra")
            .put("mode", "pomodoro").put("focusedMs", 60_000L).put("asOf", 1_000_000L).put("phaseEndsAt", 2_500_000L)
            .put("phaseMs", 1_500_000L).toString();
    }

    static Map<String, String> show(String id, int version) throws JSONException {
        Map<String, String> data = new HashMap<>();
        data.put("type", "timer"); data.put("op", "show"); data.put("entryId", id); data.put("version", String.valueOf(version));
        data.put("state", state(id, version, "running"));
        return data;
    }

    static Map<String, String> clear(String id, int version) {
        Map<String, String> data = new HashMap<>();
        data.put("type", "timer"); data.put("op", "clear"); data.put("entryId", id); data.put("version", String.valueOf(version));
        return data;
    }

    static TimerState current(String id, int version, boolean unsynced) throws JSONException {
        TimerState s = TimerState.fromJson(new JSONObject(state(id, version, "running")));
        s.unsynced = unsynced;
        return s;
    }

    @Test public void parsesAShowMessage() throws JSONException {
        PushMessage push = PushMessage.parse(show("e1", 7));
        assertEquals(PushMessage.Kind.SHOW, push.kind);
        assertEquals("e1", push.state.entryId);
        assertEquals(7, push.version);
        assertEquals(2_500_000L, push.state.phaseEndsAt);
    }

    @Test public void parsesAClearMessage() {
        PushMessage push = PushMessage.parse(clear("e1", 9));
        assertEquals(PushMessage.Kind.CLEAR, push.kind);
        assertEquals("e1", push.entryId);
        assertEquals(9, push.version);
    }

    @Test public void ignoresAnythingMalformed() throws JSONException {
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(null).kind);
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(new HashMap<>()).kind);
        Map<String, String> other = show("e1", 1); other.put("type", "digest");
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(other).kind);
        Map<String, String> noEntry = show("e1", 1); noEntry.remove("entryId");
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(noEntry).kind);
        Map<String, String> badVersion = show("e1", 1); badVersion.put("version", "x");
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(badVersion).kind);
        Map<String, String> noVersion = show("e1", 1); noVersion.remove("version");
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(noVersion).kind);
        Map<String, String> noState = show("e1", 1); noState.remove("state");
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(noState).kind);
        Map<String, String> brokenState = show("e1", 1); brokenState.put("state", "{not json");
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(brokenState).kind);
        Map<String, String> savedState = show("e1", 1); savedState.put("state", state("e1", 1, "saved"));
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(savedState).kind);
        Map<String, String> otherEntry = show("e1", 1); otherEntry.put("state", state("e2", 1, "running"));
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(otherEntry).kind);
        Map<String, String> unknownOp = show("e1", 1); unknownOp.put("op", "explode");
        assertEquals(PushMessage.Kind.IGNORE, PushMessage.parse(unknownOp).kind);
    }

    @Test public void showReplacesWhatIsNewer() throws JSONException {
        assertTrue(PushMessage.parse(show("e1", 7)).appliesTo(null));
        assertTrue("a new entry replaces any other", PushMessage.parse(show("e2", 1)).appliesTo(current("e1", 9, false)));
        assertTrue("a newer version", PushMessage.parse(show("e1", 8)).appliesTo(current("e1", 7, false)));
        assertTrue("the same version when nothing waits to be sent", PushMessage.parse(show("e1", 7)).appliesTo(current("e1", 7, false)));
        assertFalse("an older version arriving late", PushMessage.parse(show("e1", 6)).appliesTo(current("e1", 7, false)));
        assertFalse("a lock-screen action not yet sent is newer than the server's last word",
            PushMessage.parse(show("e1", 7)).appliesTo(current("e1", 7, true)));
        assertTrue("but a newer server version wins over it", PushMessage.parse(show("e1", 8)).appliesTo(current("e1", 7, true)));
    }

    @Test public void clearOnlyTheEntryThatIsShowing() throws JSONException {
        assertTrue(PushMessage.parse(clear("e1", 8)).appliesTo(current("e1", 7, false)));
        assertTrue(PushMessage.parse(clear("e1", 7)).appliesTo(current("e1", 7, false)));
        assertFalse("an older clear", PushMessage.parse(clear("e1", 6)).appliesTo(current("e1", 7, false)));
        assertFalse("another entry's clear", PushMessage.parse(clear("e2", 9)).appliesTo(current("e1", 7, false)));
        assertFalse("nothing to clear", PushMessage.parse(clear("e1", 9)).appliesTo(null));
    }

    @Test public void ignoredMessagesNeverApply() throws JSONException {
        assertFalse(PushMessage.parse(new HashMap<>()).appliesTo(null));
        assertFalse(PushMessage.parse(new HashMap<>()).appliesTo(current("e1", 1, false)));
    }
}
