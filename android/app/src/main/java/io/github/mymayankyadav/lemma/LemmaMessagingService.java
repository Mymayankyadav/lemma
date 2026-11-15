package io.github.mymayankyadav.lemma;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * N163 · receives the `push` function's data messages while the app is closed and applies them to the timer
 * notification with the same code the web layer's `timerUpdate` and `timerClear` use. The decision is `PushMessage`.
 */
public class LemmaMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage message) {
        SessionStore.Session session=SessionStore.load(this);
        // A queued token may outlive sign-out. Never display another owner's data, even while offline.
        if(session==null||!PushMessage.isForOwner(message.getData(),session.ownerId))return;
        PushMessage push = PushMessage.parse(message.getData());
        synchronized(TimerController.class){
            if(push.kind==PushMessage.Kind.NOTICE){try{push.notice.put("ownerId",session.ownerId);}catch(org.json.JSONException invalid){return;}Reminders.post(this,push.notice);return;}
            android.content.SharedPreferences prefs=getSharedPreferences("lemma.push.order",MODE_PRIVATE);
            try{
                PushOrder order=new PushOrder(new org.json.JSONObject(prefs.getString("state","{}")));
                long revision=Long.parseLong(message.getData().get("revision"));
                boolean apply=order.accept(push,revision,TimerController.load(this));
                prefs.edit().putString("state",order.toJson().toString()).apply();
                if(!apply)return;
                if(push.kind==PushMessage.Kind.SHOW){push.state.device=session.device;push.state.ownerId=session.ownerId;TimerController.show(this,push.state);}else TimerController.clear(this);
            }catch(org.json.JSONException|NumberFormatException malformed){return;}
        }
        LemmaNativePlugin.signal("timerChanged");
    }

    @Override
    public void onNewToken(String token) {
        PushToken.save(this, token);
    }
}
