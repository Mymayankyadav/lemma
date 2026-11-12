package io.github.mymayankyadav.lemma;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N2 lock-screen actions the server has not confirmed yet. The web layer replays them (checking the entry's
 * version, so nothing is applied twice) and acknowledges each one. Bounded to the last 20.
 */
public final class PendingActions {
    private static final String PREFS = "lemma.timer";
    private static final String KEY = "pending";
    private PendingActions() {}

    public static synchronized String add(Context context, String action, String entryId, int version, String text) {
        JSONArray list = all(context);
        String id = UUID.randomUUID().toString();
        try {
            JSONObject item = new JSONObject().put("id", id).put("action", action).put("entryId", entryId)
                .put("version", version).put("at", System.currentTimeMillis());
            if (text != null) item.put("text", text);
            list.put(item);
        } catch (JSONException e) {
            return id;
        }
        while (list.length() > 20) list.remove(0);
        prefs(context).edit().putString(KEY, list.toString()).apply();
        return id;
    }

    public static synchronized JSONArray all(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public static synchronized void remove(Context context, java.util.Collection<String> ids) {
        JSONArray list = all(context), kept = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.optJSONObject(i);
            if (item != null && !ids.contains(item.optString("id"))) kept.put(item);
        }
        prefs(context).edit().putString(KEY, kept.toString()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
