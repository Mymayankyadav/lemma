package io.github.mymayankyadav.lemma;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import java.util.ArrayList;
import java.util.List;

/**
 * N123 · N1 notification channels, so each kind can be tuned in Android settings. Without a push service the app
 * posts only what it schedules itself: the focus timer, focus alerts, review reminders and study-block starts.
 */
public final class Channels {
    private Channels() {}

    public static final String FOCUS = "focus";
    public static final String FOCUS_ALERTS = "focus_alerts";
    public static final String REVIEW = "review";
    public static final String CALENDAR = "calendar";

    /** The channel for a reminder kind from the web layer (unknown kinds use Review). Pure. */
    public static String forReminder(String kind) {
        return CALENDAR.equals(kind) ? CALENDAR : REVIEW;
    }

    public static void create(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        List<NotificationChannel> channels = new ArrayList<>();

        NotificationChannel focus = new NotificationChannel(FOCUS, "Focus timer", NotificationManager.IMPORTANCE_LOW);
        focus.setDescription("The running focus session, with Pause and Finish. Silent.");
        focus.setShowBadge(false);
        focus.setSound(null, null);
        focus.enableVibration(false);
        focus.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channels.add(focus);

        NotificationChannel alerts = new NotificationChannel(FOCUS_ALERTS, "Focus alerts", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("The end of a pomodoro, a break or a planned block, and the prompt to log a finished session.");
        alerts.enableVibration(true);
        alerts.setVibrationPattern(new long[] {0, 120, 80, 200});
        alerts.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channels.add(alerts);

        NotificationChannel review = new NotificationChannel(REVIEW, "Review", NotificationManager.IMPORTANCE_DEFAULT);
        review.setDescription("Cards due at your study time.");
        review.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channels.add(review);

        NotificationChannel calendar = new NotificationChannel(CALENDAR, "Study blocks", NotificationManager.IMPORTANCE_HIGH);
        calendar.setDescription("A planned study block is starting.");
        calendar.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channels.add(calendar);

        manager.createNotificationChannels(channels);
    }

    /** Channels the user turned off in system settings. */
    public static List<String> blocked(Context context) {
        List<String> out = new ArrayList<>();
        if (Build.VERSION.SDK_INT < 26) return out;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (String id : new String[] {FOCUS, FOCUS_ALERTS, REVIEW, CALENDAR}) {
            NotificationChannel channel = manager.getNotificationChannel(id);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) out.add(id);
        }
        return out;
    }
}
