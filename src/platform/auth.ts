/**
 * N123 · N0 Google sign-in in the Android app. Google blocks its sign-in page inside WebViews, so the app opens the
 * Supabase OAuth URL in a Custom Tab (the system browser, @capacitor/browser) and Supabase redirects back to the app's
 * own scheme; the PKCE code is exchanged in the WebView, where supabase-js kept the code verifier. No new native SDK.
 *
 * The native side keeps only a copy of the short-lived access token (Android Keystore encrypted), so lock-screen
 * timer actions can call the study command without opening the app. It never holds the refresh token: Supabase
 * rotates refresh tokens and treats a reused one as theft, so two holders would sign each other out.
 */
import type {SupabaseClient} from '@supabase/supabase-js';
import {AUTH_CALLBACK} from './device';
import {authCallback} from './links';

export async function nativeSignIn(db: SupabaseClient): Promise<void> {
  const {data, error} = await db.auth.signInWithOAuth({provider: 'google', options: {redirectTo: AUTH_CALLBACK, skipBrowserRedirect: true}});
  if (error) throw error;
  if (!data?.url) throw new Error('Sign-in could not start. Try again.');
  const {Browser} = await import('@capacitor/browser');
  await Browser.open({url: data.url, presentationStyle: 'popover'});
}

/** Finish sign-in from the callback URL; true when the URL was the callback (handled, successfully or not). */
export async function finishNativeSignIn(href: string, db: () => Promise<SupabaseClient>, report: (message: string) => void): Promise<boolean> {
  const result = authCallback(href);
  if (!result) return href.startsWith(AUTH_CALLBACK);
  try {
    const {Browser} = await import('@capacitor/browser');
    await Browser.close().catch(() => undefined);
  } catch {/* the tab may already be gone */}
  if ('error' in result) {report('Sign-in was cancelled or failed: ' + result.error); return true;}
  const client = await db();
  const {error} = await client.auth.exchangeCodeForSession(result.code);
  if (error) {report('Sign-in did not finish. Try again.'); return true;}
  const back = (() => {try {return sessionStorage.getItem('lemma:oauth-return');} catch {return null;}})();
  window.location.hash = back && back.startsWith('#/') ? back : '#/';
  window.location.reload();
  return true;
}
