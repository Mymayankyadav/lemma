import { lazy, Suspense } from "react";
import { v7Screen } from "../../app/v7Kit";
import { Link, useLocation } from "react-router";
import { isFlagOn } from "../../flags";
import { useSignIn } from "../../data/hooks";
import { getMode } from "../../data/mode";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/Toast";
const SignInV7 = lazy(() => import("./v7/SignInV7"));
export default function Page() {
  // v7 Sign-in (PLAN §6.15) behind v7Shell; the existing page stays for rollback.
  if (v7Screen() === "sign-in") return <Suspense fallback={null}><SignInV7/></Suspense>;
  return <LegacySignIn/>;
}
function LegacySignIn() {
  const signIn = useSignIn(),
    location = useLocation(),
    notify = useToast();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  return (
    <section className="flex min-h-[75dvh] flex-col items-center justify-center text-center">
      <p className="text-label italic text-ink-3" style={{fontFamily:'var(--font-display)'}}>A geometer’s notebook</p>
      <p className="mt-4 text-num-xl font-medium italic text-ink" style={{fontFamily:'var(--font-display)'}}>Lemma</p>
      <div aria-hidden="true" className="mt-4 h-px w-24 bg-amber-line"/>
      <h1 className="mt-6 text-title-s font-medium italic" style={{fontFamily:'var(--font-display)'}}>Sign in</h1>
      <p className="mt-2 font-math text-answer text-ink-2">Your mathematical study record.</p>
      {getMode() !== "demo" && <Button
        className="mt-8 w-full max-w-sm"
        disabled={signIn.isPending}
        onClick={async () => {
          try {
            sessionStorage.setItem("lemma:sign-in-return", from);
            await signIn.mutateAsync();
          } catch {
            notify("Couldn't start Google sign-in.", { tone: "danger" });
          }
        }}
      >
        Continue with Google
      </Button>}
      {getMode() !== "demo" && isFlagOn("v6Shell") && (
        <a href="?demo=1#/" className="mt-4 inline-flex min-h-11 items-center text-label text-ink-2 underline">Try the example workspace</a>
      )}
      {getMode() === "demo" && (isFlagOn("v6Shell") ? <div className="mt-6 flex w-full max-w-sm flex-col items-center gap-3">
        {/* N121 F12: demo mode is not a dead end; go back, or switch to your own record. */}
        <p className="text-label text-ink-2">You're in the example workspace.</p>
        <Link to="/" className="flex min-h-12 w-full items-center justify-center rounded-[8px] bg-[var(--accent)] font-semibold text-[var(--on-accent)]">Back to Today</Link>
        <a href="?demo=0#/sign-in" className="inline-flex min-h-11 items-center text-label text-ink-2 underline">Sign in with Google</a>
      </div> : (
        <p className="mt-4 text-label text-ink-3">
          Sign-in is available in live mode.
        </p>
      ))}
    </section>
  );
}
