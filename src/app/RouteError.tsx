import {useEffect} from "react";
import {Link, useRouteError} from "react-router";

const chunkFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
};

/** A readable error screen for each route; keeps a failed render from blanking the app. */
export default function RouteError(){
  const error = useRouteError();
  const chunk = chunkFailure(error);
  useEffect(() => {
    if (!chunk) return;
    const key = `lemma:chunk-reload:${window.location.pathname}${window.location.hash}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    } catch { /* Storage can be disabled; the readable fallback remains. */ }
  }, [chunk]);
  return <main role="alert" className="mx-auto flex min-h-dvh max-w-[560px] flex-col gap-4 bg-obsidian p-6 text-ink">
    <h1 className="font-serif text-title">Couldn’t open this screen</h1>
    <p className="text-body text-ink-2">This page could not be displayed. Your pending work has not been approved or discarded.</p>
    <div className="flex flex-wrap gap-3">
      <Link to="/" className="ghost flex min-h-11 items-center rounded-ctl px-4">Back to Today</Link>
      <button type="button" onClick={()=>window.location.reload()} className="lit min-h-11 px-4">Reload screen</button>
    </div>
  </main>;
}

export function RouteFallback(){
  return <main role="status" aria-live="polite" className="mx-auto min-h-dvh max-w-[560px] bg-obsidian p-6 text-ink">
    <h1 className="font-serif text-title">Loading screen…</h1>
    <div aria-hidden="true" className="mt-6 h-20 animate-pulse rounded-slab bg-fill-1"/>
    <div aria-hidden="true" className="mt-3 h-48 animate-pulse rounded-slab bg-fill-1"/>
  </main>;
}
