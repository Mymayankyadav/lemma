package io.github.mymayankyadav.lemma;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/**
 * N123 · N0 every way into the app from a system surface opens an App Link to a route (`/review`, `/focus?finish=1`),
 * delivered to MainActivity, where Capacitor's App plugin hands it to the web layer's router. One path, one parser.
 */
public final class Links {
    private Links() {}

    public static final String ORIGIN = "https://mymayankyadav.github.io/lemma/";

    /** The App Link for an in-app route. Routes must start with "/" (anything else opens Today). Pure. */
    public static String url(String route) {
        String safe = route != null && route.startsWith("/") && route.length() < 2048 ? route : "/";
        return ORIGIN + "#" + safe;
    }

    public static Intent intent(Context context, String route) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse(url(route)))
            .setClass(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    public static PendingIntent pending(Context context, String route, int requestCode) {
        return PendingIntent.getActivity(context, requestCode, intent(context, route),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
