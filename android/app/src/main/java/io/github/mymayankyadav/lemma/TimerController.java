package io.github.mymayankyadav.lemma;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.service.quicksettings.TileService;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N2 the native focus timer: one ongoing notification drawn from timestamps (the system ticks the chronometer,
 * so no foreground service runs), an alarm at the end of each timed phase, the Quick Settings tile, and Study mode.
 * The state is persisted so a reboot or a killed process restores it (BootReceiver), and replaced whenever the web
 * layer syncs from the server.
 */
public final class TimerController {
    private TimerController() {}

    public static final int ONGOING_ID = 7001;
    public static final int ALERT_ID = 7002;
    private static final String PREFS = "lemma.timer";
    static final String EXTRA_REPLY = "thought";

    public static synchronized TimerState load(Context context) {
        String raw = prefs(context).getString("state", null);
        if (raw == null) return null;
        try {
            return TimerState.fromJson(new JSONObject(raw));
        } catch (JSONException e) {
            return null;
        }
    }

    private static synchronized void save(Context context, TimerState state) {
        SharedPreferences.Editor editor = prefs(context).edit();
        if (state == null) editor.remove("state"); else editor.putString("state", state.toJson().toString());
        editor.apply();
    }

    /** Show (or replace) the timer everywhere: notification, alarm, tile, Study mode. */
    public static void show(Context context, TimerState state) {
        save(context, state);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            manager.notify(ONGOING_ID, build(context, state, System.currentTimeMillis()));
        } catch (SecurityException noPermission) {
            // Notifications are off: the tile, alarm and the app still work.
        }
        scheduleAlarm(context, state);
        StudyMode.apply(context, TimerState.RUNNING.equals(state.status));
        refreshTile(context);
    }

    public static void clear(Context context) {
        save(context, null);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(ONGOING_ID);
        cancelAlarm(context);
        StudyMode.apply(context, false);
        refreshTile(context);
    }

    static Notification build(Context context, TimerState s, long now) {
        TimeZone zone = TimeZone.getDefault();
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, Channels.FOCUS) : new Notification.Builder(context);
        b.setSmallIcon(R.drawable.ic_stat_lemma)
            .setColor(context.getColor(R.color.lemma_ink))
            .setContentTitle(TimerText.title(s))
            .setContentText(TimerText.text(s, now, zone))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(Links.pending(context, "/focus", 1));
        if (!s.context.isEmpty()) b.setSubText(s.context);
        boolean ended = TimerText.ended(s, now);
        if (TimerState.PAUSED.equals(s.status) || ended) {
            b.setShowWhen(false).setUsesChronometer(false);
        } else if (s.phaseEndsAt > 0) {
            b.setShowWhen(true).setUsesChronometer(true).setWhen(s.phaseEndsAt);
            b.setChronometerCountDown(true);
        } else if (TimerState.RUNNING.equals(s.status)) {
            b.setShowWhen(true).setUsesChronometer(true).setWhen(now - s.focusedAt(now));
        } else {
            b.setShowWhen(false);
        }
        int code = 10;
        for (String action : TimerText.actions(s)) {
            PendingIntent intent = TimerActionReceiver.pending(context, action, s.entryId, code++);
            Notification.Action.Builder ab = new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_stat_lemma), TimerText.label(action, s), intent);
            if (TimerText.THOUGHT.equals(action)) {
                ab.addRemoteInput(new RemoteInput.Builder(EXTRA_REPLY).setLabel("Park a thought…").build());
            }
            b.addAction(ab.build());
        }
        if (Build.VERSION.SDK_INT >= 36) liveUpdate(b, s, now, zone);
        return b.build();
    }

    /** Android 16 Live Update: a segmented progress bar (one segment per pomodoro) and a status-bar chip. */
    private static void liveUpdate(Notification.Builder b, TimerState s, long now, TimeZone zone) {
        if (Build.VERSION.SDK_INT < 36) return;
        Bundle extras = new Bundle();
        extras.putBoolean("android.requestPromotedOngoing", true);
        b.addExtras(extras);
        b.setShortCriticalText(TimerText.chip(s, zone));
        if (s.phaseMs <= 0 || s.phaseEndsAt <= 0) return;
        Notification.ProgressStyle style = new Notification.ProgressStyle();
        List<Notification.ProgressStyle.Segment> segments = new ArrayList<>();
        int elapsed = (int) Math.max(0, Math.min(s.phaseMs, s.phaseMs - (s.phaseEndsAt - now)) / 60_000L);
        if ("pomodoro".equals(s.mode) && TimerState.RUNNING.equals(s.status)) {
            for (int i = 0; i < s.cycles; i++) segments.add(new Notification.ProgressStyle.Segment(s.focusMinutes));
            style.setProgressSegments(segments).setProgress(Math.min(s.cycles * s.focusMinutes, (Math.min(s.cycle, s.cycles) - 1) * s.focusMinutes + elapsed));
        } else {
            segments.add(new Notification.ProgressStyle.Segment((int) Math.max(1, s.phaseMs / 60_000L)));
            style.setProgressSegments(segments).setProgress(elapsed);
        }
        style.setStyledByProgress(true);
        b.setStyle(style);
    }

    static PendingIntent alarmIntent(Context context, TimerState s) {
        Intent intent = new Intent(context, TimerActionReceiver.class).setAction(TimerActionReceiver.ACTION)
            .putExtra(TimerActionReceiver.EXTRA_OP, TimerActionReceiver.PHASE_END)
            .putExtra(TimerActionReceiver.EXTRA_ENTRY, s == null ? "" : s.entryId)
            .putExtra(TimerActionReceiver.EXTRA_AT, s == null ? 0L : s.phaseEndsAt);
        return PendingIntent.getBroadcast(context, 2, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void scheduleAlarm(Context context, TimerState s) {
        cancelAlarm(context);
        long now = System.currentTimeMillis();
        if (s == null || !s.timed() || s.phaseEndsAt <= now) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent intent = alarmIntent(context, s);
        boolean exact = AlarmPolicy.exact(Build.VERSION.SDK_INT, Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms());
        try {
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, s.phaseEndsAt, intent);
            else alarms.setWindow(AlarmManager.RTC_WAKEUP, AlarmPolicy.windowStart(s.phaseEndsAt, now), AlarmPolicy.WINDOW_MS, intent);
        } catch (SecurityException revoked) {
            alarms.setWindow(AlarmManager.RTC_WAKEUP, AlarmPolicy.windowStart(s.phaseEndsAt, now), AlarmPolicy.WINDOW_MS, intent);
        }
    }

    static void cancelAlarm(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        alarms.cancel(alarmIntent(context, null));
    }

    static void refreshTile(Context context) {
        try {
            TileService.requestListeningState(context, new ComponentName(context, FocusTileService.class));
        } catch (RuntimeException ignored) {
            // The tile may not be added; nothing to refresh.
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
