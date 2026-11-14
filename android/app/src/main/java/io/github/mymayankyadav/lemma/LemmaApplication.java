package io.github.mymayankyadav.lemma;

import android.app.Application;

/** N163 · starts Firebase in every process the app runs in, including the one Android starts to deliver a push. */
public class LemmaApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        PushToken.init(this);
    }
}
