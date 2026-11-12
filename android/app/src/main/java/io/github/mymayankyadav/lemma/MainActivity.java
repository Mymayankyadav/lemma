package io.github.mymayankyadav.lemma;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** N123 · the Capacitor activity: the existing React app, plus Lemma's native plugin and share intake. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LemmaNativePlugin.class);
        super.onCreate(savedInstanceState);
        Channels.create(this);
        ShareIntake.capture(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ShareIntake.capture(this, intent);
    }
}
