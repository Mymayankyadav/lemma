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
        PushMessage push = PushMessage.parse(message.getData());
        if (!push.appliesTo(TimerController.load(this))) return;
        if (push.kind == PushMessage.Kind.SHOW) TimerController.show(this, push.state);
        else TimerController.clear(this);
        LemmaNativePlugin.signal("timerChanged");
    }

    @Override
    public void onNewToken(String token) {
        PushToken.save(this, token);
    }
}
