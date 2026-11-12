package io.github.mymayankyadav.lemma;

import android.content.Context;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.os.Build;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** N123 · N3 dynamic launcher shortcuts ("Resume Real analysis", "Review 12"), next to the static ones in shortcuts.xml. */
public final class Shortcuts {
    private Shortcuts() {}

    public static void set(Context context, JSONArray items) {
        if (Build.VERSION.SDK_INT < 25) return;
        ShortcutManager manager = context.getSystemService(ShortcutManager.class);
        if (manager == null) return;
        List<ShortcutInfo> shortcuts = new ArrayList<>();
        int limit = Math.min(2, Math.max(0, manager.getMaxShortcutCountPerActivity() - 4));
        for (int i = 0; i < items.length() && shortcuts.size() < limit; i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || item.optString("id").isEmpty()) continue;
            String label = item.optString("label", "Lemma");
            shortcuts.add(new ShortcutInfo.Builder(context, "dynamic-" + item.optString("id"))
                .setShortLabel(label.length() > 25 ? label.substring(0, 25) : label)
                .setLongLabel(label)
                .setIcon(Icon.createWithResource(context, item.optString("id").startsWith("review") ? R.drawable.shortcut_review : R.drawable.shortcut_atlas))
                .setIntent(Links.intent(context, item.optString("route", "/")))
                .setRank(i)
                .build());
        }
        try {
            manager.setDynamicShortcuts(shortcuts);
        } catch (IllegalStateException | IllegalArgumentException rateLimited) {
            // Launchers rate-limit updates; the next sync tries again.
        }
    }
}
