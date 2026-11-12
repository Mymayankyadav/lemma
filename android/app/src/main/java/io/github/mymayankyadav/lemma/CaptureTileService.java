package io.github.mymayankyadav.lemma;

import android.annotation.SuppressLint;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** N123 · N4 Quick Settings "Capture": opens Lemma's Capture sheet from anywhere. */
public class CaptureTileService extends TileService {
    @Override
    public void onStartListening() {
        Tile tile = getQsTile();
        if (tile == null) return;
        tile.setState(Tile.STATE_INACTIVE);
        tile.setLabel("Capture");
        if (Build.VERSION.SDK_INT >= 29) tile.setSubtitle("Lemma");
        tile.updateTile();
    }

    @Override
    public void onClick() {
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(Links.pending(this, "/?capture=1", 41));
        else startLegacy();
    }

    /** Android 7–13 only: the Intent overload is the one those versions have. */
    @SuppressLint("StartActivityAndCollapseDeprecated")
    @SuppressWarnings("deprecation")
    private void startLegacy() {
        startActivityAndCollapse(Links.intent(this, "/?capture=1"));
    }
}
