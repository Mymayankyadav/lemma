package io.github.mymayankyadav.lemma;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * N123 · N2 after a reboot or an app update: rebuild the timer notification, its alarm and the tile from the stored
 * state, re-arm reminders, and make sure Study mode is not left on. The app re-syncs from the server when opened.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        Channels.create(context);
        TimerState state = TimerController.load(context);
        if (state != null) TimerController.show(context, state);
        else StudyMode.apply(context, false);
        Reminders.rearm(context);
    }
}
