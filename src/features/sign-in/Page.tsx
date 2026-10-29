import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth, useBootstrap, useSignIn } from "../../data/hooks";
import { getMode } from "../../data/mode";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/Toast";
export default function Page() {
  const auth = useAuth(),
    bootstrap = useBootstrap(),
    signIn = useSignIn(),
    location = useLocation(),
    navigate = useNavigate(),
    notify = useToast(),
    started = useRef(false);
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  useEffect(() => {
    if (getMode() === "demo" || !auth.data || started.current) return;
    started.current = true;
    void bootstrap
      .mutateAsync()
      .then(() => {
        const target = sessionStorage.getItem("lemma:sign-in-return") ?? from;
        sessionStorage.removeItem("lemma:sign-in-return");
        void navigate(target, { replace: true });
      })
      .catch(() => {
        started.current = false;
        notify("Couldn't finish sign-in. Try again.", { tone: "danger" });
      });
  }, [auth.data]);
  return (
    <section className="flex min-h-[75dvh] flex-col items-center justify-center text-center">
      <span
        aria-hidden="true"
        className="font-math text-[120px] italic leading-none text-amber drop-shadow-[0_0_24px_var(--amber-line-2)]"
      >
        ∫
      </span>
      <h1 className="mt-6 text-[28px] font-semibold">Sign in</h1>
      <p className="mt-2 text-[20px] font-semibold">Lemma</p>
      <p className="mt-2 font-math text-[17px] text-ink-2">
        Your math study record.
      </p>
      <Button
        className="mt-8 w-full max-w-sm"
        disabled={
          signIn.isPending || bootstrap.isPending || getMode() === "demo"
        }
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
      </Button>
      {getMode() === "demo" && (
        <p className="mt-4 text-[13px] text-ink-3">
          Sign-in is available in live mode.
        </p>
      )}
    </section>
  );
}
