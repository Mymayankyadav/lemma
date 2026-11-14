package io.github.mymayankyadav.lemma;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * N164 · a tap on a button of a server reminder. The request runs off the main thread; the notification is dismissed
 * only once the server accepted the action, so a tap made offline can be made again.
 */
public final class NoticeActionReceiver extends BroadcastReceiver {
    static final String EXTRA_TOKEN = "token", EXTRA_NOTIFICATION = "nid";

    @Override
    public void onReceive(Context context, Intent intent) {
        final String token = intent.getStringExtra(EXTRA_TOKEN);
        final int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION, 0);
        final Context app = context.getApplicationContext();
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                if (NoticeActionClient.post(token)) ((NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(notificationId);
            } finally {
                pending.finish();
            }
        }).start();
    }
}
