package io.github.mymayankyadav.lemma;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/** N123 · the Capacitor activity: the existing React app, plus Lemma's native plugin and share intake. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LemmaNativePlugin.class);
        super.onCreate(savedInstanceState);
        applyOrientation(getResources().getConfiguration());
        applyPaper();
        applyTextZoom(getResources().getConfiguration());
        keepRunningOnBack();
        Channels.create(this);
        ShareIntake.capture(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ShareIntake.capture(this, intent);
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        applyOrientation(configuration);
        applyPaper();
        applyTextZoom(configuration);
    }

    /** AW1 (E5): the system font size, capped at 200% (TextZoomPolicy). A font-scale change recreates the activity, so
     *  onCreate also applies it. */
    private void applyTextZoom(Configuration configuration) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().getSettings().setTextZoom(TextZoomPolicy.textZoom(configuration.fontScale));
    }

    /**
     * AW7 (v7 UX audit r3): the WebView kept its default (white) background until the page painted, so a slow start at
     * night showed a light frame. It takes the page colour of the current Day/Night resources (lemma_paper), also when
     * the system theme changes (uiMode is handled here, so the activity is not recreated).
     */
    private void applyPaper() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.lemma_paper));
    }

    /**
     * AW8: before Android 12 the system's own back finishes a root activity. When the web layer releases back (Today
     * with nothing open), this fallback moves the task to the back instead, as minimizeApp did. Added without a
     * lifecycle owner, it sits under the App plugin's callback, which is re-added on every start, so it runs only
     * while that callback is disabled.
     */
    private void keepRunningOnBack() {
        if (BackPolicy.systemLeavesRunning(Build.VERSION.SDK_INT)) return;
        getOnBackPressedDispatcher().addCallback(new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                moveTaskToBack(true);
            }
        });
    }

    /** N159: follow system rotation on phones, tablets and unfolded foldables (OrientationPolicy). */
    private void applyOrientation(Configuration configuration) {
        // Translate the pure policy's values to Android's orientation constants for its @IntDef contract.
        int wanted = OrientationPolicy.requested(configuration.smallestScreenWidthDp) == OrientationPolicy.UNSPECIFIED
                ? ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        if (getRequestedOrientation() != wanted) setRequestedOrientation(wanted);
    }
}
