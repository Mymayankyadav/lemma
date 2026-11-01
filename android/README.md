# Lemma Android Trusted Web Activity

A thin Android Browser Helper 2.7.4 shell for https://mymayankyadav.github.io/lemma/ — no second web app or WebView.

Use JDK 17 and Android SDK 36. Run `cd android && ./gradlew lint bundleRelease`.
Without the four ANDROID_UPLOAD_* signing secrets the AAB is unsigned; do not upload it to Play until signed by the owner. Never commit keystores, passwords, local.properties or google-services.json.

Digital Asset Links must be published at the origin root in the separate user-site repository, not under /lemma/. See docs/android/setup.md. The disabled lemma-widget intent alias is a placeholder for AND-7; do not enable it until PairActivity and its tests exist.
