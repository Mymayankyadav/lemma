package io.github.mymayankyadav.lemma;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N1 reminders the web layer computed (reminders.ts): each is an alarm that posts one notification on its
 * channel. Later (+1 h), Snooze (+10 min) and Not today run here without opening the app; Start review and Start now
 * open the app on the right route. The whole schedule is replaced on every sync; snoozes survive until they fire.
 */
public class Reminders extends BroadcastReceiver {
    static final String ACTION_FIRE = "io.github.mymayankyadav.lemma.REMINDER";
    static final String ACTION_DO = "io.github.mymayankyadav.lemma.REMINDER_ACTION";
    private static final String PREFS = "lemma.reminders";

    /** A stable notification and alarm id for a reminder id. Pure. */
    public static int notificationId(String id) {
        return 0x4000 + (id.hashCode() & 0x3fff) * 4;
    }

    /** "Not today" silences a reminder id for the rest of that local day. Pure. */
    public static boolean suppressed(JSONObject notToday, String id, String today) {
        return notToday != null && today.equals(notToday.optString(id, ""));
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date());
    }

    public static synchronized int set(Context context, JSONArray items) {
        SharedPreferences prefs = prefs(context);
        JSONArray previous = array(prefs.getString("items", "[]"));
        for (int i = 0; i < previous.length(); i++) {
            JSONObject item = previous.optJSONObject(i);
            if (item != null) cancel(context, item.optString("id"));
        }
        JSONArray kept = new JSONArray();
        long now = System.currentTimeMillis();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || item.optLong("at", 0) <= now || item.optString("id").isEmpty()) continue;
            kept.put(item);
        }
        prefs.edit().putString("items", kept.toString()).apply();
        rearm(context);
        return kept.length();
    }

    /** Re-arm every stored reminder and snooze that is still in the future (after boot or a new schedule). */
    public static synchronized void rearm(Context context) {
        long now = System.currentTimeMillis();
        for (String key : new String[] {"items", "snoozed"}) {
            JSONArray list = array(prefs(context).getString(key, "[]")), future = new JSONArray();
            for (int i = 0; i < list.length(); i++) {
                JSONObject item = list.optJSONObject(i);
                if (item == null || item.optLong("at", 0) <= now) continue;
                future.put(item);
                arm(context, item);
            }
            prefs(context).edit().putString(key, future.toString()).apply();
        }
    }

    private static void arm(Context context, JSONObject item) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent fire = fireIntent(context, item);
        long at = item.optLong("at"), now = System.currentTimeMillis();
        boolean exact = AlarmPolicy.exact(Build.VERSION.SDK_INT, Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms());
        try {
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            else alarms.setWindow(AlarmManager.RTC_WAKEUP, AlarmPolicy.windowStart(at, now), AlarmPolicy.WINDOW_MS, fire);
        } catch (SecurityException revoked) {
            alarms.setWindow(AlarmManager.RTC_WAKEUP, AlarmPolicy.windowStart(at, now), AlarmPolicy.WINDOW_MS, fire);
        }
    }

    /** Cancels the scheduled alarm of a reminder id (a snooze has its own alarm and is kept until it fires). */
    private static void cancel(Context context, String id) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        alarms.cancel(PendingIntent.getBroadcast(context, notificationId(id), new Intent(context, Reminders.class).setAction(ACTION_FIRE),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    private static PendingIntent fireIntent(Context context, JSONObject item) {
        Intent intent = new Intent(context, Reminders.class).setAction(ACTION_FIRE).putExtra("item", item.toString());
        int code = notificationId(item.optString("id")) + (item.optBoolean("snoozed", false) ? 1 : 0);
        return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        JSONObject item;
        try {
            item = new JSONObject(intent.getStringExtra("item"));
        } catch (JSONException | NullPointerException e) {
            return;
        }
        if (ACTION_FIRE.equals(intent.getAction())) post(context, item);
        else if (ACTION_DO.equals(intent.getAction())) act(context, item, intent.getStringExtra("action"));
    }

    private static void post(Context context, JSONObject item) {
        String id = item.optString("id");
        if (suppressed(object(prefs(context).getString("notToday", "{}")), id, today())) return;
        Notification.Builder b = builder(context, Channels.forReminder(item.optString("channel")))
            .setContentTitle(item.optString("title"))
            .setContentText(item.optString("body"))
            .setAutoCancel(true)
            .setContentIntent(Links.pending(context, item.optString("route", "/"), notificationId(id) + 1))
            .setPublicVersion(builder(context, Channels.forReminder(item.optString("channel"))).setContentTitle(item.optString("publicTitle", "Lemma")).build());
        JSONArray actions = item.optJSONArray("actions");
        for (int i = 0; actions != null && i < Math.min(3, actions.length()); i++) {
            JSONObject action = actions.optJSONObject(i);
            if (action == null) continue;
            String kind = action.optString("id");
            PendingIntent target = ("open".equals(kind) || "start_block".equals(kind))
                ? Links.pending(context, action.optString("route", item.optString("route", "/")), notificationId(id) + 2)
                : PendingIntent.getBroadcast(context, notificationId(id) + 3 + i * 0x10000,
                    new Intent(context, Reminders.class).setAction(ACTION_DO).putExtra("item", item.toString()).putExtra("action", kind),
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(new Notification.Action.Builder(Icon.createWithResource(context, R.drawable.ic_stat_lemma), action.optString("label"), target).build());
        }
        try {
            ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).notify(notificationId(id), b.build());
        } catch (SecurityException noPermission) {
            // Off in system settings; Today shows the same.
        }
    }

    private static synchronized void act(Context context, JSONObject item, String action) {
        String id = item.optString("id");
        ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(notificationId(id));
        if ("not_today".equals(action)) {
            JSONObject notToday = object(prefs(context).getString("notToday", "{}"));
            try {
                notToday.put(id, today());
            } catch (JSONException ignored) {
                return;
            }
            prefs(context).edit().putString("notToday", notToday.toString()).apply();
            return;
        }
        long delay = "later".equals(action) ? 60 * 60_000L : "snooze10".equals(action) ? 10 * 60_000L : 0;
        if (delay == 0) return;
        try {
            JSONObject snoozed = new JSONObject(item.toString()).put("id", id).put("snoozed", true).put("at", System.currentTimeMillis() + delay);
            JSONArray list = array(prefs(context).getString("snoozed", "[]")), kept = new JSONArray();
            for (int i = 0; i < list.length(); i++) {
                JSONObject other = list.optJSONObject(i);
                if (other != null && !id.equals(other.optString("id"))) kept.put(other);
            }
            kept.put(snoozed);
            prefs(context).edit().putString("snoozed", kept.toString()).apply();
            arm(context, snoozed);
        } catch (JSONException ignored) {
            // Nothing to snooze.
        }
    }

    private static Notification.Builder builder(Context context, String channel) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, channel) : new Notification.Builder(context);
        return b.setSmallIcon(R.drawable.ic_stat_lemma).setColor(context.getColor(R.color.lemma_ink)).setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PRIVATE);
    }

    private static JSONArray array(String raw) {
        try { return new JSONArray(raw); } catch (JSONException e) { return new JSONArray(); }
    }

    private static JSONObject object(String raw) {
        try { return new JSONObject(raw); } catch (JSONException e) { return new JSONObject(); }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
