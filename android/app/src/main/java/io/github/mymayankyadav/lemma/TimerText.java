package io.github.mymayankyadav.lemma;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** N123 · N2 every word the timer's notification, lock screen and tile show. Pure, unit-tested. */
public final class TimerText {
    private TimerText() {}

    public static final String PAUSE = "pause";
    public static final String RESUME = "resume";
    public static final String BREAK = "break";
    public static final String FINISH = "finish";
    public static final String THOUGHT = "thought";

    public static String clock(long ms, TimeZone zone, boolean h24) {
        Calendar c = Calendar.getInstance(zone, Locale.ROOT);
        c.setTimeInMillis(ms);
        int h = c.get(Calendar.HOUR_OF_DAY), m = c.get(Calendar.MINUTE);
        if (h24) return String.format(Locale.ROOT, "%02d:%02d", h, m);
        int h12 = h % 12 == 0 ? 12 : h % 12;
        return String.format(Locale.ROOT, "%d:%02d %s", h12, m, h < 12 ? "am" : "pm");
    }

    public static String duration(long ms) {
        long minutes = Math.max(0, Math.round(ms / 60_000.0));
        if (minutes < 60) return minutes + " min";
        return (minutes / 60) + " h " + String.format(Locale.ROOT, "%02d", minutes % 60) + " min";
    }

    public static String title(TimerState s) {
        return s.intention == null || s.intention.trim().isEmpty() ? "Focused study" : s.intention.trim();
    }

    /** "Focus · until 15:50 · Pomodoro 2 of 4", "Paused · 42 min focused", "Break · until 15:55". */
    public static String text(TimerState s, long now, TimeZone zone) {
        String out;
        if (ended(s, now)) {
            out = phaseEndTitle(s);
        } else if (TimerState.PAUSED.equals(s.status)) {
            out = "Paused · " + duration(s.focusedAt(now)) + " focused";
        } else if (TimerState.BREAK.equals(s.status)) {
            out = s.phaseEndsAt > 0 ? "Break · until " + clock(s.phaseEndsAt, zone, s.clock24h) : "Break";
        } else if ("pomodoro".equals(s.mode) && s.phaseEndsAt > 0) {
            out = "Focus · until " + clock(s.phaseEndsAt, zone, s.clock24h) + " · Pomodoro " + Math.min(s.cycle, s.cycles) + " of " + s.cycles;
        } else if (s.phaseEndsAt > 0) {
            out = "Focus · until " + clock(s.phaseEndsAt, zone, s.clock24h);
        } else {
            out = "flowtime".equals(s.mode) ? "Focus · flowtime" : "Focus · open session";
        }
        return s.unsynced ? out + " · syncing" : out;
    }

    /** A timed phase whose end has passed (the server moves it on when the app next syncs). */
    public static boolean ended(TimerState s, long now) {
        return s.phaseEndsAt > 0 && !TimerState.PAUSED.equals(s.status) && now >= s.phaseEndsAt;
    }

    /** The status-bar chip on Android 16: the end time of a timed phase, or the state word. */
    public static String chip(TimerState s, TimeZone zone) {
        if (TimerState.PAUSED.equals(s.status)) return "Paused";
        if (s.phaseEndsAt > 0) return clock(s.phaseEndsAt, zone, s.clock24h);
        return TimerState.BREAK.equals(s.status) ? "Break" : "Focus";
    }

    /** At most three actions (Android shows three). A pomodoro's breaks come on schedule, so it offers a thought instead. */
    public static List<String> actions(TimerState s) {
        List<String> out = new ArrayList<>();
        if (TimerState.RUNNING.equals(s.status)) {
            out.add(PAUSE);
            out.add("pomodoro".equals(s.mode) ? THOUGHT : BREAK);
        } else {
            out.add(RESUME);
        }
        out.add(FINISH);
        return out;
    }

    public static String label(String action, TimerState s) {
        switch (action) {
            case PAUSE: return "Pause";
            case RESUME: return TimerState.BREAK.equals(s.status) ? "Skip break" : "Resume";
            case BREAK: return "Break";
            case THOUGHT: return "Park a thought";
            case FINISH: return "Finish";
            default: return action;
        }
    }

    public static String tileSubtitle(TimerState s, TimeZone zone) {
        if (s == null) return "Start focus";
        if (TimerState.PAUSED.equals(s.status)) return "Paused";
        if (s.phaseEndsAt > 0) return (TimerState.BREAK.equals(s.status) ? "Break · " : "Until ") + clock(s.phaseEndsAt, zone, s.clock24h);
        return TimerState.BREAK.equals(s.status) ? "Break" : "Running";
    }

    /** The heads-up at the end of a phase. */
    public static String phaseEndTitle(TimerState s) {
        if (TimerState.BREAK.equals(s.status)) return "Break is over";
        if ("pomodoro".equals(s.mode)) return "Pomodoro " + Math.min(s.cycle, s.cycles) + " of " + s.cycles + " done";
        return "Planned focus time is up";
    }

    public static String phaseEndText(TimerState s) {
        if (TimerState.BREAK.equals(s.status)) return "Back to: " + title(s);
        return "pomodoro".equals(s.mode) ? "Take a " + s.breakMinutes + "-minute break, or keep going." : "Finish to log it, or keep going.";
    }
}
