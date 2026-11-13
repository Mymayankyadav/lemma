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

/**
 * N157 · AW17: when the sign-in tab is closed and no callback arrives (the learner gave up, or the app's address is not
 * yet a Supabase redirect URL, so the tab ended on the website instead), say what happened instead of nothing.
 */
export const SIGN_IN_DID_NOT_RETURN = 'Sign-in did not come back to Lemma. Try again; if it happens every time, the app\'s sign-in address still has to be added on the server, and the website works meanwhile.';
export const RETURN_GRACE_MS = 1500;
let waiting = false;
const reportToast = (message: string) => {void import('../ui/Toast').then(({toast}) => toast(message, {tone: 'danger'})).catch(() => undefined);};
/** What to say when the tab closed: the message while a sign-in is still waiting for its callback, else nothing. */
export const signInClosedMessage = (stillWaiting: boolean): string | null => stillWaiting ? SIGN_IN_DID_NOT_RETURN : null;

export async function nativeSignIn(db: SupabaseClient, report: (message: string) => void = reportToast): Promise<void> {
  const {data, error} = await db.auth.signInWithOAuth({provider: 'google', options: {redirectTo: AUTH_CALLBACK, skipBrowserRedirect: true}});
  if (error) throw error;
  if (!data?.url) throw new Error('Sign-in could not start. Try again.');
  const {Browser} = await import('@capacitor/browser');
  waiting = true;
  const closed = await Browser.addListener('browserFinished', () => {
    window.setTimeout(() => {
      const message = signInClosedMessage(waiting);
      waiting = false;
      void closed.remove();
      if (message) report(message);
    }, RETURN_GRACE_MS);
  });
  await Browser.open({url: data.url, presentationStyle: 'popover'});
}

/** Finish sign-in from the callback URL; true when the URL was the callback (handled, successfully or not). */
export async function finishNativeSignIn(href: string, db: () => Promise<SupabaseClient>, report: (message: string) => void): Promise<boolean> {
  const result = authCallback(href);
  if (!result) return href.startsWith(AUTH_CALLBACK);
  waiting = false;
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
