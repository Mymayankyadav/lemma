package io.github.mymayankyadav.lemma;

/**
 * N123 · N2 how an end-of-phase or reminder alarm is set. Exact when Android allows it (always before 12, and from 12
 * when the user granted "Alarms & reminders"); otherwise a one-minute window. Lemma never asks for USE_EXACT_ALARM,
 * which Play limits to alarm-clock and calendar apps. Pure, unit-tested.
 */
public final class AlarmPolicy {
    private AlarmPolicy() {}

    public static final long WINDOW_MS = 60_000L;

    public static boolean exact(int sdk, boolean canScheduleExact) {
        return sdk < 31 || canScheduleExact;
    }

    /** The window start for an inexact alarm: centred on the target, never in the past. */
    public static long windowStart(long at, long now) {
        return Math.max(now, at - WINDOW_MS / 2);
    }
}
