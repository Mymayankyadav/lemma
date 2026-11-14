package io.github.mymayankyadav.lemma;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * N163 · Firebase Cloud Messaging without the google-services plugin: Firebase starts from the four public values in
 * `android/app/firebase.properties` (compiled into BuildConfig). Blank values mean FCM is off: nothing starts, no token is
 * asked for, and the app behaves as before. The token is kept here and sent to the server by the web layer.
 */
final class PushToken {
    private static final String PREFS = "lemma.push";

    private PushToken() {}

    static boolean configured() {
        return configured(BuildConfig.FCM_APPLICATION_ID, BuildConfig.FCM_API_KEY, BuildConfig.FCM_PROJECT_ID, BuildConfig.FCM_SENDER_ID);
    }

    static boolean configured(String applicationId, String apiKey, String projectId, String senderId) {
        return !applicationId.trim().isEmpty() && !apiKey.trim().isEmpty() && !projectId.trim().isEmpty() && !senderId.trim().isEmpty();
    }

    /** Start Firebase in this process (every process that can receive a message needs it). Idempotent. */
    static synchronized boolean init(Context context) {
        if (!configured()) return false;
        try {
            if (FirebaseApp.getApps(context).isEmpty()) {
                FirebaseApp.initializeApp(context, new FirebaseOptions.Builder()
                    .setApplicationId(BuildConfig.FCM_APPLICATION_ID).setApiKey(BuildConfig.FCM_API_KEY)
                    .setProjectId(BuildConfig.FCM_PROJECT_ID).setGcmSenderId(BuildConfig.FCM_SENDER_ID).build());
            }
            return true;
        } catch (RuntimeException invalid) {
            return false; // wrong values: FCM stays off rather than crashing the app
        }
    }

    /** Ask Firebase for this phone's token; it is saved and the web layer is told when it arrives. */
    static void request(Context context) {
        if (!init(context)) return;
        try {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) save(context, task.getResult());
            });
        } catch (RuntimeException ignored) {
            // Google Play services missing or too old: no push on this phone.
        }
    }

    static void save(Context context, String token) {
        String previous = saved(context);
        prefs(context).edit().putString("token", token).apply();
        if (!token.equals(previous)) LemmaNativePlugin.signal("pushToken");
    }

    static String saved(Context context) {
        return prefs(context).getString("token", null);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
