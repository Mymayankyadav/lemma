import { useLocation } from "react-router";
import { useSignIn } from "../../data/hooks";
import { getMode } from "../../data/mode";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/Toast";
export default function Page() {
  const signIn = useSignIn(),
    location = useLocation(),
    notify = useToast();
  const from = (location.state as { from?: string } | null)?.from ?? "/";
  return (
    <section className="flex min-h-[75dvh] flex-col items-center justify-center text-center">
      <span
        aria-hidden="true"
        className="font-math text-[length:var(--type-decor-icon)] italic leading-none text-amber drop-shadow-[0_0_24px_var(--amber-line-2)]"
      >
        ∫
      </span>
      <h1 className="mt-6 text-title font-semibold">Sign in</h1>
      <p className="mt-2 text-card font-semibold">Lemma</p>
      <p className="mt-2 font-math text-answer text-ink-2">
        Your math study record.
      </p>
      <Button
        className="mt-8 w-full max-w-sm"
        disabled={
          signIn.isPending || getMode() === "demo"
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
        <p className="mt-4 text-label text-ink-3">
          Sign-in is available in live mode.
        </p>
      )}
    </section>
  );
}
