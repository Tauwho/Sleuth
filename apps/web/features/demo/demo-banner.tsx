"use client";

import { useEffect, useState } from "react";
import { useDemoApi } from "@/components/guest-auth-provider";
import { readRecMode, REC_CSS } from "./rec-mode";

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Demo mode's notice (ADR 0010). It is on every page, so no screenshot or recording of the demo
 * can be mistaken for a live analysis. Outside the recording view it also has Reset, which forgets
 * this tab's changes and opens the dashboard again.
 */
export function DemoBanner({ disclosure }: { disclosure: string }) {
  const demo = useDemoApi();
  const [rec, setRec] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const on = readRecMode(window.location.search, tabStorage());
    if (on) document.documentElement.dataset.rec = "1";
    else delete document.documentElement.dataset.rec;
    // Set after mount, so the server render and the first client render agree.
    const t = window.setTimeout(() => setRec(on), 0);
    return () => window.clearTimeout(t);
  }, []);

  const reset = async () => {
    if (!demo || resetting) return;
    setResetting(true);
    await demo.reset();
    window.location.assign("/");
  };

  return (
    <div
      role="note"
      aria-label="Demo mode"
      data-testid="demo-banner"
      data-rec={rec ? "1" : undefined}
      className="flex flex-wrap items-center justify-center gap-3 border-b border-line bg-surface px-4 py-2 text-center text-sm text-muted print:hidden"
    >
      {rec ? <style>{REC_CSS}</style> : null}
      <span>{disclosure}</span>
      {rec || !demo ? null : (
        <button
          type="button"
          onClick={() => void reset()}
          disabled={resetting}
          className="rounded-md border border-line-strong px-2 py-0.5 text-xs text-foreground hover:bg-raised"
        >
          {resetting ? "Resetting..." : "Reset demo"}
        </button>
      )}
    </div>
  );
}
