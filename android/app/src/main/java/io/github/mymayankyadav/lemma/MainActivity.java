package io.github.mymayankyadav.lemma;

import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** N123 · the Capacitor activity: the existing React app, plus Lemma's native plugin and share intake. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LemmaNativePlugin.class);
        super.onCreate(savedInstanceState);
        applyOrientation(getResources().getConfiguration());
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
    }

    /** E8: portrait on phones, free rotation on tablets and unfolded foldables (OrientationPolicy). */
    private void applyOrientation(Configuration configuration) {
        int wanted = OrientationPolicy.requested(configuration.smallestScreenWidthDp);
        if (getRequestedOrientation() != wanted) setRequestedOrientation(wanted);
    }
}
