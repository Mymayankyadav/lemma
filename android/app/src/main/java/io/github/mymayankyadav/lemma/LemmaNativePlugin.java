package io.github.mymayankyadav.lemma;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · the app's own Capacitor plugin: the bridge between the web layer (src/platform/bridge.ts) and Android's system
 * surfaces. Every method is small and delegates to a class that owns one surface.
 */
@CapacitorPlugin(
    name = "LemmaNative",
    permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
        @Permission(alias = "calendar", strings = {Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR})
    }
)
public class LemmaNativePlugin extends Plugin {
    private static WeakReference<LemmaNativePlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
        Channels.create(getContext());
    }

    /** Tell the web layer something happened natively (a lock-screen action, a share), if it is running. */
    static void signal(String event) {
        LemmaNativePlugin plugin = instance.get();
        if (plugin != null) plugin.notifyListeners(event, new JSObject());
    }

    // ---- session -------------------------------------------------------------------------------------------------

    @PluginMethod
    public void setSession(PluginCall call) {
        String url = call.getString("url", ""), key = call.getString("key", ""), token = call.getString("accessToken", "");
        Long expiresAt = call.getLong("expiresAt", 0L);
        if (!url.startsWith("https://") || key.isEmpty() || token.isEmpty()) {
            call.reject("Invalid session");
            return;
        }
        SessionStore.save(getContext(), new SessionStore.Session(url, key, token, expiresAt == null ? 0 : expiresAt));
        call.resolve();
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        SessionStore.clear(getContext());
        call.resolve();
    }

    // ---- focus timer ---------------------------------------------------------------------------------------------

    @PluginMethod
    public void timerUpdate(PluginCall call) {
        try {
            TimerState incoming = TimerState.fromJson(call.getObject("state"));
            TimerState current = TimerController.load(getContext());
            // A lock-screen action not yet replayed wins over an older server read of the same session.
            boolean stale = current != null && current.unsynced && current.entryId.equals(incoming.entryId)
                && incoming.version <= current.version && PendingActions.all(getContext()).length() > 0;
            if (!stale) TimerController.show(getContext(), incoming);
            call.resolve();
        } catch (JSONException | NullPointerException e) {
            call.reject("Invalid timer state");
        }
    }

    @PluginMethod
    public void timerClear(PluginCall call) {
        TimerController.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void timerPendingActions(PluginCall call) {
        call.resolve(new JSObject().put("actions", JSArray.from(toList(PendingActions.all(getContext())))));
    }

    @PluginMethod
    public void timerAckActions(PluginCall call) {
        Set<String> ids = new HashSet<>();
        JSArray list = call.getArray("ids", new JSArray());
        for (int i = 0; i < list.length(); i++) ids.add(list.optString(i));
        PendingActions.remove(getContext(), ids);
        call.resolve();
    }

    // ---- notifications and reminders ------------------------------------------------------------------------------

    private String notificationWord() {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT < 33) return manager.areNotificationsEnabled() ? "granted" : "denied";
        PermissionState state = getPermissionState("notifications");
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private boolean exactAlarms() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return ((AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms();
    }

    @PluginMethod
    public void notificationStatus(PluginCall call) {
        call.resolve(new JSObject().put("permission", notificationWord()).put("exactAlarms", exactAlarms())
            .put("channelsBlocked", JSArray.from(Channels.blocked(getContext()).toArray())));
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("permission", notificationWord()));
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsAnswered");
    }

    @PermissionCallback
    private void notificationsAnswered(PluginCall call) {
        call.resolve(new JSObject().put("permission", notificationWord()));
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        String channel = call.getString("channel");
        if (Build.VERSION.SDK_INT < 26) {
            open(call, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())));
            return;
        }
        Intent intent = channel != null && !channel.isEmpty()
            ? new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_CHANNEL_ID, channel)
            : new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        open(call, intent);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < 31) {
            call.resolve();
            return;
        }
        open(call, new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
    }

    @PluginMethod
    public void remindersSet(PluginCall call) {
        int scheduled = Reminders.set(getContext(), call.getArray("items", new JSArray()));
        call.resolve(new JSObject().put("scheduled", scheduled));
    }

    // ---- study mode ----------------------------------------------------------------------------------------------

    @PluginMethod
    public void studyModeStatus(PluginCall call) {
        Context c = getContext();
        call.resolve(new JSObject().put("access", StudyMode.hasAccess(c)).put("enabled", StudyMode.enabled(c)).put("active", StudyMode.active(c)));
    }

    @PluginMethod
    public void studyModeSetEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        StudyMode.setEnabled(getContext(), enabled);
        TimerState state = TimerController.load(getContext());
        StudyMode.apply(getContext(), state != null && TimerState.RUNNING.equals(state.status));
        call.resolve();
    }

    @PluginMethod
    public void openStudyModeSettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
    }

    // ---- calendar ------------------------------------------------------------------------------------------------

    private String calendarWord() {
        PermissionState state = getPermissionState("calendar");
        return state == PermissionState.GRANTED ? "granted" : state == PermissionState.DENIED ? "denied" : "prompt";
    }

    @PluginMethod
    public void calendarStatus(PluginCall call) {
        call.resolve(new JSObject().put("permission", calendarWord()));
    }

    @PluginMethod
    public void calendarRequest(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("permission", "granted"));
            return;
        }
        requestPermissionForAlias("calendar", call, "calendarAnswered");
    }

    @PermissionCallback
    private void calendarAnswered(PluginCall call) {
        call.resolve(new JSObject().put("permission", calendarWord()));
    }

    private boolean calendarAllowed(PluginCall call) {
        if (getPermissionState("calendar") == PermissionState.GRANTED) return true;
        call.reject("Calendar permission is not granted");
        return false;
    }

    @PluginMethod
    public void calendarList(PluginCall call) {
        if (!calendarAllowed(call)) return;
        runInBackground(call, () -> call.resolve(new JSObject().put("calendars", JSArray.from(toList(CalendarSync.list(getContext()))))));
    }

    @PluginMethod
    public void calendarSync(PluginCall call) {
        if (!calendarAllowed(call)) return;
        JSArray events = call.getArray("events", new JSArray());
        long from = call.getLong("from", 0L), to = call.getLong("to", 0L);
        runInBackground(call, () -> {
            int[] counts = CalendarSync.sync(getContext(), events, from, to);
            call.resolve(new JSObject().put("inserted", counts[0]).put("updated", counts[1]).put("deleted", counts[2]));
        });
    }

    @PluginMethod
    public void calendarRemoveAll(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.resolve(new JSObject().put("deleted", 0));
            return;
        }
        runInBackground(call, () -> call.resolve(new JSObject().put("deleted", CalendarSync.removeAll(getContext()))));
    }

    @PluginMethod
    public void calendarBusy(PluginCall call) {
        if (!calendarAllowed(call)) return;
        long from = call.getLong("from", 0L), to = call.getLong("to", 0L);
        JSArray ids = call.getArray("calendarIds", new JSArray());
        Set<String> chosen = new HashSet<>();
        for (int i = 0; i < ids.length(); i++) chosen.add(ids.optString(i));
        runInBackground(call, () -> call.resolve(new JSObject().put("busy", JSArray.from(toList(CalendarSync.busy(getContext(), from, to, chosen))))));
    }

    // ---- capture: share, voice, shortcuts -----------------------------------------------------------------------

    @PluginMethod
    public void shareTake(PluginCall call) {
        call.resolve(new JSObject().put("items", JSArray.from(toList(ShareIntake.take()))));
    }

    private Intent recogniser(String prompt) {
        return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
    }

    @PluginMethod
    public void voiceAvailable(PluginCall call) {
        boolean available = recogniser("").resolveActivity(getContext().getPackageManager()) != null;
        call.resolve(new JSObject().put("available", available));
    }

    @PluginMethod
    public void voiceRecognise(PluginCall call) {
        try {
            startActivityForResult(call, recogniser(call.getString("prompt", "Say what to add")), "voiceResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Voice input is not available on this phone");
        }
    }

    @ActivityCallback
    private void voiceResult(PluginCall call, ActivityResult result) {
        String text = null;
        if (result.getData() != null) {
            ArrayList<String> found = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (found != null && !found.isEmpty()) text = found.get(0);
        }
        JSObject out = new JSObject();
        out.put("text", text == null ? JSONObject.NULL : text);
        call.resolve(out);
    }

    @PluginMethod
    public void shortcutsSet(PluginCall call) {
        Shortcuts.set(getContext(), call.getArray("items", new JSArray()));
        call.resolve();
    }

    // ---- helpers -------------------------------------------------------------------------------------------------

    private interface Work { void run() throws Exception; }

    private void runInBackground(PluginCall call, Work work) {
        new Thread(() -> {
            try {
                work.run();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Failed" : e.getMessage());
            }
        }, "lemma-native").start();
    }

    private void open(PluginCall call, Intent intent) {
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Settings page not available");
        }
    }

    private static List<Object> toList(JSONArray array) {
        List<Object> out = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) out.add(array.opt(i));
        return out;
    }
}
