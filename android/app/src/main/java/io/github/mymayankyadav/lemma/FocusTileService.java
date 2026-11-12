package io.github.mymayankyadav.lemma;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import java.util.TimeZone;

/** N123 · N2 Quick Settings "Focus": shows the session; a tap pauses or resumes it, or opens Quick focus when idle. */
public class FocusTileService extends TileService {
    @Override
    public void onStartListening() {
        render();
    }

    @Override
    public void onClick() {
        TimerState state = TimerController.load(this);
        if (state == null) {
            PendingIntent open = Links.pending(this, "/?quick=1", 40);
            if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(open);
            else startLegacy();
            return;
        }
        String op = TimerState.RUNNING.equals(state.status) ? TimerText.PAUSE : TimerText.RESUME;
        new Thread(() -> {
            TimerActionReceiver.handle(getApplicationContext(), op, state.entryId, null, 0L);
            render();
        }, "lemma-tile").start();
    }

    /** Android 7–13 only: the Intent overload is the one those versions have. */
    @SuppressLint("StartActivityAndCollapseDeprecated")
    @SuppressWarnings("deprecation")
    private void startLegacy() {
        startActivityAndCollapse(Links.intent(this, "/?quick=1"));
    }

    private void render() {
        Tile tile = getQsTile();
        if (tile == null) return;
        TimerState state = TimerController.load(this);
        tile.setLabel(state == null ? "Focus" : TimerState.BREAK.equals(state.status) ? "Break" : TimerState.PAUSED.equals(state.status) ? "Focus paused" : "Focus");
        tile.setState(state != null && TimerState.RUNNING.equals(state.status) ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        if (Build.VERSION.SDK_INT >= 29) tile.setSubtitle(TimerText.tileSubtitle(state, TimeZone.getDefault()));
        tile.setContentDescription(state == null ? "Start a focus session" : TimerText.title(state) + ", " + TimerText.tileSubtitle(state, TimeZone.getDefault()));
        tile.updateTile();
    }
}
