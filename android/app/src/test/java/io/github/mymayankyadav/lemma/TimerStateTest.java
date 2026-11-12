package io.github.mymayankyadav.lemma;

import static org.junit.Assert.*;

import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

public class TimerStateTest {
    static TimerState running(String mode) throws JSONException {
        return TimerState.fromJson(new JSONObject().put("entryId", "e1").put("version", 3).put("status", "running")
            .put("intention", "Rudin ch 4").put("mode", mode).put("focusedMs", 600_000L).put("asOf", 1_000_000L)
            .put("phaseEndsAt", "pomodoro".equals(mode) ? 1_900_000L : 0L).put("phaseMs", "pomodoro".equals(mode) ? 1_500_000L : 0L)
            .put("cycle", 2).put("cycles", 4).put("breakMinutes", 5).put("focusMinutes", 25));
    }

    @Test public void roundTripsThroughJson() throws JSONException {
        TimerState s = running("pomodoro");
        TimerState back = TimerState.fromJson(s.toJson());
        assertEquals("e1", back.entryId);
        assertEquals(3, back.version);
        assertEquals(1_900_000L, back.phaseEndsAt);
        assertEquals(2, back.cycle);
        assertFalse(back.unsynced);
    }

    @Test(expected = JSONException.class) public void rejectsUnknownStatus() throws JSONException {
        TimerState.fromJson(new JSONObject().put("entryId", "e1").put("status", "saved"));
    }

    @Test(expected = JSONException.class) public void requiresAnEntry() throws JSONException {
        TimerState.fromJson(new JSONObject().put("status", "running"));
    }

    @Test public void focusedTimeGrowsOnlyWhileRunning() throws JSONException {
        TimerState s = running("open");
        assertEquals(660_000L, s.focusedAt(1_060_000L));
        TimerState paused = s.after("pause", 1_060_000L);
        assertEquals(660_000L, paused.focusedAt(9_999_999L));
    }

    @Test public void pauseFreezesAndClearsThePhase() throws JSONException {
        TimerState paused = running("pomodoro").after("pause", 1_100_000L);
        assertEquals(TimerState.PAUSED, paused.status);
        assertEquals(0L, paused.phaseEndsAt);
        assertEquals(700_000L, paused.focusedMs);
        assertTrue(paused.unsynced);
        assertEquals("the version is the one the action was taken against", 3, paused.version);
    }

    @Test public void breakStartsACountdownOfTheBreakLength() throws JSONException {
        TimerState onBreak = running("open").after("break", 2_000_000L);
        assertEquals(TimerState.BREAK, onBreak.status);
        assertEquals(2_000_000L + 5 * 60_000L, onBreak.phaseEndsAt);
    }

    @Test public void resumeRestartsAPomodoroButNotAnOpenSession() throws JSONException {
        TimerState pomodoro = running("pomodoro").after("pause", 1_100_000L).after("resume", 1_200_000L);
        assertEquals(TimerState.RUNNING, pomodoro.status);
        assertEquals(1_200_000L + 25 * 60_000L, pomodoro.phaseEndsAt);
        TimerState open = running("open").after("pause", 1_100_000L).after("resume", 1_200_000L);
        assertEquals(0L, open.phaseEndsAt);
    }

    @Test public void actionsThatDoNotApplyAreRefused() throws JSONException {
        TimerState s = running("open");
        assertNull(s.after("resume", 1_100_000L));
        TimerState paused = s.after("pause", 1_100_000L);
        assertNull(paused.after("pause", 1_200_000L));
        assertNull(paused.after("break", 1_200_000L));
        assertNull(s.after("delete", 1_100_000L));
    }
}
