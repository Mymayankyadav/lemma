# Android Trusted Web Activity — owner setup

The Android shell reuses the existing Lemma PWA. The steps below are **owner-only**; never commit certificate keys, passwords or tokens. Follow [android.md §8](../spec/android.md#8-what-the-owner-must-provide-one-time-never-committed) in order.

1. Create a Google Play Console developer account, complete its identity checks, create **Lemma** with package `io.github.mymayankyadav.lemma`, and enable Play App Signing. The package name cannot change after first upload.
2. Generate and keep an Android upload keystore privately. Configure the four repository Actions secrets named `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, and `ANDROID_UPLOAD_KEY_PASSWORD`. Do not upload the keystore to GitHub or paste any values into issues.
3. Obtain the SHA-256 fingerprints of **both** the Play app-signing certificate (Play Console › App integrity) and the upload certificate. Replace the two public placeholders in [assetlinks.template.json](assetlinks.template.json) with the corresponding colon-separated fingerprints.
4. Create the user-site repository `Mymayankyadav/mymayankyadav.github.io`, enable Pages, and publish `.nojekyll` plus `.well-known/assetlinks.json` at the **origin root**. Copy the filled template into that second repository, not under `/lemma/`. Verify the public `/.well-known/assetlinks.json` returns JSON over HTTPS.
5. Run the Android CI workflow after AND-3 lands. Download its `.aab` artifact, upload the **first** release manually to Play Console › Internal testing, and add your own Google account as a tester. Without signing secrets, CI produces an unsigned artifact requiring local signing before upload.
6. Install the internal test build and check that the TWA opens Lemma without a URL bar. If Digital Asset Links do not verify, the fallback is a Custom Tab with a URL bar; recheck both certificate fingerprints and the root-hosted file.

The shell needs neither Firebase nor a second web app. Notifications have separate one-time Web Push setup steps in [notifications.md §10](../spec/notifications.md#10-what-the-owner-must-provide-one-time-never-committed). Offline review is not enabled by this setup.
