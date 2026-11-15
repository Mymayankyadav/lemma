package io.github.mymayankyadav.lemma;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * N123 · N2 lock-screen actions the server has not confirmed yet. The web layer replays them (checking the entry's
 * version, so nothing is applied twice) and acknowledges each one. Accepted actions are never evicted.
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
            SessionStore.Session session=SessionStore.load(context);
            TimerState state=TimerController.load(context);
            if(session!=null)item.put("ownerId",session.ownerId);
            if(state!=null)item.put("device",state.device);
            if (text != null) item.put("text", text);
            list.put(item);
        } catch (JSONException e) {
            return id;
        }
        // Accepted offline actions are durable until acknowledged. Never evict user text for a queue limit.
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

    /** Upgrade receipts only when the stored session proves which account created the legacy queue. */
    public static synchronized void adoptUnowned(Context context,String owner,String device){
        JSONArray list=all(context);
        for(int i=0;i<list.length();i++){
            JSONObject item=list.optJSONObject(i);if(item==null||!item.optString("ownerId","").isEmpty())continue;
            try{item.put("ownerId",owner);item.put("device",device);}catch(JSONException invalid){throw new IllegalStateException(invalid);}
        }
        prefs(context).edit().putString(KEY,list.toString()).apply();
    }

    public static synchronized JSONArray forOwner(Context context){
        SessionStore.Session session=SessionStore.load(context);JSONArray out=new JSONArray();if(session==null)return out;
        JSONArray list=all(context);for(int i=0;i<list.length();i++){
            JSONObject item=list.optJSONObject(i);if(item!=null&&session.ownerId.equals(item.optString("ownerId")))out.put(item);
        }return out;
    }

    public static synchronized JSONObject find(Context context,String id){
        JSONArray list=all(context);for(int i=0;i<list.length();i++){JSONObject item=list.optJSONObject(i);if(item!=null&&id.equals(item.optString("id")))return item;}return null;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
