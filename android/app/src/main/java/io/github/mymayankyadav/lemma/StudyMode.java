package io.github.mymayankyadav.lemma;

import android.app.AutomaticZenRule;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.service.notification.Condition;
import androidx.annotation.RequiresApi;

/**
 * N123 · N5 Study mode (opt-in, off by default, Owner decision D13): while a focus session runs, Lemma turns on a
 * "Lemma study" Do Not Disturb mode and turns it off at pause, break or finish. On Android 10+ this is an automatic
 * rule of Lemma's own (shown under Modes on Android 15+), so the user's own Do Not Disturb is never touched; on older
 * versions Lemma sets Priority-only and restores "all" only if it turned it on. Never left on: boot and every sync
 * re-apply the right state.
 */
public final class StudyMode {
    private StudyMode() {}

    private static final String PREFS = "lemma.studymode";
    private static final Uri CONDITION = Uri.parse("condition://io.github.mymayankyadav.lemma/study");

    public static boolean hasAccess(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager.isNotificationPolicyAccessGranted();
    }

    public static boolean enabled(Context context) { return prefs(context).getBoolean("enabled", false); }
    public static boolean active(Context context) { return prefs(context).getBoolean("active", false); }

    public static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean("enabled", enabled).apply();
        if (!enabled) apply(context, false);
    }

    /** Turn the study mode on while focusing (when enabled and allowed), off otherwise. Idempotent. */
    public static synchronized void apply(Context context, boolean focusing) {
        boolean want = focusing && enabled(context) && hasAccess(context);
        if (want == active(context) && !(want && Build.VERSION.SDK_INT >= 29 && ruleId(context) == null)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                String id = want ? ensureRule(context, manager) : ruleId(context);
                if (id != null) manager.setAutomaticZenRuleState(id, new Condition(CONDITION, want ? "Focusing" : "Not focusing",
                    want ? Condition.STATE_TRUE : Condition.STATE_FALSE));
            } else if (want) {
                if (manager.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL) {
                    manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY);
                    prefs(context).edit().putBoolean("legacyOwned", true).apply();
                }
            } else if (prefs(context).getBoolean("legacyOwned", false)) {
                manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL);
                prefs(context).edit().putBoolean("legacyOwned", false).apply();
            }
            prefs(context).edit().putBoolean("active", want).apply();
        } catch (SecurityException revoked) {
            prefs(context).edit().putBoolean("active", false).apply();
        }
    }

    private static String ruleId(Context context) { return prefs(context).getString("ruleId", null); }

    @RequiresApi(29)
    private static String ensureRule(Context context, NotificationManager manager) {
        String id = ruleId(context);
        if (id != null && manager.getAutomaticZenRule(id) != null) return id;
        AutomaticZenRule rule = new AutomaticZenRule("Lemma study", null, new ComponentName(context, MainActivity.class), CONDITION,
            null, NotificationManager.INTERRUPTION_FILTER_PRIORITY, true);
        id = manager.addAutomaticZenRule(rule);
        prefs(context).edit().putString("ruleId", id).apply();
        return id;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
