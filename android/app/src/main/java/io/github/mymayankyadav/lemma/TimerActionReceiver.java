package io.github.mymayankyadav.lemma;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import java.util.Collections;

/**
 * N123 · N2 Pause, Break, Resume, Finish, Save and "Park a thought" from the notification, lock screen or tile, and the
 * end-of-phase alarm. The change shows at once (optimistically, marked "syncing"); the study command runs with the
 * stored session, and anything the server did not confirm waits for the web layer to replay it.
 */
public class TimerActionReceiver extends BroadcastReceiver {
    public static final String ACTION = "io.github.mymayankyadav.lemma.TIMER";
    public static final String EXTRA_OP = "op";
    public static final String EXTRA_ENTRY = "entryId";
    public static final String EXTRA_AT = "at";
    public static final String PHASE_END = "phase_end";
    public static final String SAVE = "save";

    static PendingIntent pending(Context context, String op, String entryId, int requestCode) {
        Intent intent = new Intent(context, TimerActionReceiver.class).setAction(ACTION)
            .putExtra(EXTRA_OP, op).putExtra(EXTRA_ENTRY, entryId);
        // An inline reply must be able to add its text to the intent, so that one action is mutable.
        int mutability = TimerText.THOUGHT.equals(op) && Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | mutability);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION.equals(intent.getAction())) return;
        String op = intent.getStringExtra(EXTRA_OP), entryId = intent.getStringExtra(EXTRA_ENTRY);
        if (op == null) return;
        String text = null;
        if (TimerText.THOUGHT.equals(op)) {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            CharSequence reply = results == null ? null : results.getCharSequence(TimerController.EXTRA_REPLY);
            text = reply == null ? null : reply.toString().trim();
        }
        final String thought = text;
        long alarmAt = intent.getLongExtra(EXTRA_AT, 0L);
        PendingResult async = goAsync();
        new Thread(() -> {
            try {
                handle(context.getApplicationContext(), op, entryId, thought, alarmAt);
            } finally {
                async.finish();
            }
        }, "lemma-timer-action").start();
    }

    /** Also used by the Quick Settings tile. Runs off the main thread (it may make one network call). */
    static void handle(Context context, String op, String entryId, String text, long alarmAt) {
        TimerState state = TimerController.load(context);
        if (state == null || (entryId != null && !entryId.isEmpty() && !entryId.equals(state.entryId))) return;
        long now = System.currentTimeMillis();
        switch (op) {
            case PHASE_END:
                if (alarmAt != state.phaseEndsAt) return;
                TimerController.show(context, state);
                postPhaseEnd(context, state);
                return;
            case TimerText.THOUGHT:
                if (text != null && !text.isEmpty()) PendingActions.add(context, TimerText.THOUGHT, state.entryId, state.version, text.substring(0, Math.min(500, text.length())));
                TimerController.show(context, state);
                LemmaNativePlugin.signal("timerAction");
                return;
            case TimerText.FINISH:
                finish(context, state);
                return;
            case SAVE:
                save(context, state);
                return;
            default:
                TimerState next = state.after(op, now);
                if (next == null) return;
                cancelAlert(context);
                TimerController.show(context, next);
                String pendingId = PendingActions.add(context, op, state.entryId, state.version, null);
                SessionStore.Session session = SessionStore.load(context);
                if (StudyCommandClient.usable(session, now)) {
                    int version = StudyCommandClient.run(session, op, state.entryId, state.version);
                    if (version >= 0) {
                        PendingActions.remove(context, Collections.singleton(pendingId));
                        next.version = version;
                        next.unsynced = false;
                        TimerController.show(context, next);
                    }
                }
                LemmaNativePlugin.signal("timerAction");
        }
    }

    /** Finish: stop the clock on the server (pause), then ask to log it, like the app's finish sheet. */
    private static void finish(Context context, TimerState state) {
        long now = System.currentTimeMillis();
        String pendingId = PendingActions.add(context, TimerText.FINISH, state.entryId, state.version, null);
        TimerState paused = TimerState.RUNNING.equals(state.status) ? state.after(TimerText.PAUSE, now) : state.copy();
        SessionStore.Session session = SessionStore.load(context);
        if (StudyCommandClient.usable(session, now)) {
            int version = TimerState.RUNNING.equals(state.status) ? StudyCommandClient.run(session, TimerText.PAUSE, state.entryId, state.version) : state.version;
            if (version >= 0) {
                PendingActions.remove(context, Collections.singleton(pendingId));
                paused.version = version;
                paused.unsynced = false;
            }
        }
        TimerController.show(context, paused);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        manager.cancel(TimerController.ONGOING_ID);
        Notification.Builder b = alertBuilder(context)
            .setContentTitle("Log this session")
            .setContentText(TimerText.duration(paused.focusedAt(now)) + " focused · " + TimerText.title(paused))
            .setContentIntent(Links.pending(context, "/focus?finish=1", 3))
            .setOngoing(false)
            .setAutoCancel(true);
        if (!paused.unsynced) b.addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_stat_lemma),
            "Save " + TimerText.duration(paused.focusedAt(now)), pending(context, SAVE, paused.entryId, 30)).build());
        b.addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_stat_lemma),
            "Rate and save", Links.pending(context, "/focus?finish=1", 4)).build());
        notifyAlert(context, b.build());
        LemmaNativePlugin.signal("timerAction");
    }

    private static void save(Context context, TimerState state) {
        long now = System.currentTimeMillis();
        SessionStore.Session session = SessionStore.load(context);
        int version = StudyCommandClient.usable(session, now) ? StudyCommandClient.run(session, SAVE, state.entryId, state.version) : -1;
        if (version >= 0) {
            TimerController.clear(context);
            Notification.Builder b = alertBuilder(context).setContentTitle("Logged " + TimerText.duration(state.focusedAt(now)))
                .setContentText(TimerText.title(state)).setAutoCancel(true).setOnlyAlertOnce(true);
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(6_000L);
            notifyAlert(context, b.build());
        } else {
            PendingActions.add(context, SAVE, state.entryId, state.version, null);
            notifyAlert(context, alertBuilder(context).setContentTitle("Couldn’t log this session yet")
                .setContentText("Tap to finish logging it in Lemma.").setAutoCancel(true)
                .setContentIntent(Links.pending(context, "/focus?finish=1", 5)).build());
        }
        LemmaNativePlugin.signal("timerAction");
    }

    private static void postPhaseEnd(Context context, TimerState state) {
        Notification.Builder b = alertBuilder(context)
            .setContentTitle(TimerText.phaseEndTitle(state))
            .setContentText(TimerText.phaseEndText(state))
            .setContentIntent(Links.pending(context, "/focus", 6))
            .setAutoCancel(true);
        if (TimerState.BREAK.equals(state.status)) {
            b.addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_stat_lemma), "Back to focus",
                pending(context, TimerText.RESUME, state.entryId, 31)).build());
        } else if ("pomodoro".equals(state.mode)) {
            b.addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_stat_lemma), "Start break",
                pending(context, TimerText.BREAK, state.entryId, 32)).build());
        }
        b.addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_stat_lemma), "Finish",
            pending(context, TimerText.FINISH, state.entryId, 33)).build());
        notifyAlert(context, b.build());
    }

    private static Notification.Builder alertBuilder(Context context) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, Channels.FOCUS_ALERTS) : new Notification.Builder(context);
        return b.setSmallIcon(R.drawable.ic_stat_lemma).setColor(context.getColor(R.color.lemma_ink))
            .setCategory(Notification.CATEGORY_REMINDER).setVisibility(Notification.VISIBILITY_PUBLIC);
    }

    private static void notifyAlert(Context context, Notification notification) {
        try {
            ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(TimerController.ALERT_ID, notification);
        } catch (SecurityException noPermission) {
            // Notifications are off; the app shows the same state when opened.
        }
    }

    private static void cancelAlert(Context context) {
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(TimerController.ALERT_ID);
    }
}
