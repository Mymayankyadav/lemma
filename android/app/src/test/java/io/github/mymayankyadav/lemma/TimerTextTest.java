package io.github.mymayankyadav.lemma;

import static org.junit.Assert.*;

import java.util.Arrays;
import java.util.TimeZone;
import org.json.JSONException;
import org.junit.Test;

public class TimerTextTest {
    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");

    @Test public void clocksFollowTheLearnersFormat() {
        long at = 15 * 3600_000L + 50 * 60_000L;
        assertEquals("15:50", TimerText.clock(at, UTC, true));
        assertEquals("3:50 pm", TimerText.clock(at, UTC, false));
        assertEquals("12:05 am", TimerText.clock(5 * 60_000L, UTC, false));
    }

    @Test public void durations() {
        assertEquals("0 min", TimerText.duration(10_000L));
        assertEquals("42 min", TimerText.duration(42 * 60_000L));
        assertEquals("1 h 05 min", TimerText.duration(65 * 60_000L));
    }

    @Test public void pomodoroText() throws JSONException {
        TimerState s = TimerStateTest.running("pomodoro");
        s.phaseEndsAt = 15 * 3600_000L + 50 * 60_000L;
        assertEquals("Focus · until 15:50 · Pomodoro 2 of 4", TimerText.text(s, s.phaseEndsAt - 1, UTC));
        assertEquals("15:50", TimerText.chip(s, UTC));
    }

    @Test public void pausedOpenAndBreakText() throws JSONException {
        TimerState open = TimerStateTest.running("open");
        assertEquals("Focus · open session", TimerText.text(open, 1_000_000L, UTC));
        TimerState paused = open.after("pause", 1_000_000L + 32 * 60_000L);
        assertEquals("Paused · 42 min focused · syncing", TimerText.text(paused, 5_000_000L, UTC));
        TimerState onBreak = open.after("break", 0L);
        assertTrue(TimerText.text(onBreak, 0L, UTC).startsWith("Break · until 00:05"));
    }

    @Test public void anEndedPhaseSaysSo() throws JSONException {
        TimerState s = TimerStateTest.running("pomodoro");
        assertTrue(TimerText.ended(s, s.phaseEndsAt));
        assertEquals("Pomodoro 2 of 4 done", TimerText.text(s, s.phaseEndsAt + 1000, UTC));
        assertFalse(TimerText.ended(s.after("pause", s.phaseEndsAt - 10), s.phaseEndsAt + 1000));
    }

    @Test public void atMostThreeActionsPerState() throws JSONException {
        TimerState open = TimerStateTest.running("open");
        assertEquals(Arrays.asList("pause", "break", "finish"), TimerText.actions(open));
        assertEquals(Arrays.asList("pause", "thought", "finish"), TimerText.actions(TimerStateTest.running("pomodoro")));
        TimerState paused = open.after("pause", 1_000_000L);
        assertEquals(Arrays.asList("resume", "finish"), TimerText.actions(paused));
        assertEquals("Resume", TimerText.label("resume", paused));
        assertEquals("Skip break", TimerText.label("resume", open.after("break", 1_000_000L)));
    }

    @Test public void tileSubtitles() throws JSONException {
        assertEquals("Start focus", TimerText.tileSubtitle(null, UTC));
        assertEquals("Running", TimerText.tileSubtitle(TimerStateTest.running("open"), UTC));
        assertEquals("Paused", TimerText.tileSubtitle(TimerStateTest.running("open").after("pause", 1L), UTC));
    }

    @Test public void anEmptyIntentionHasAName() throws JSONException {
        TimerState s = TimerStateTest.running("open");
        s.intention = "  ";
        assertEquals("Focused study", TimerText.title(s));
    }
}
