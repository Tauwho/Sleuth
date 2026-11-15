"use client";

import { useCallback, useEffect, useState } from "react";
import { useDemoApi } from "@/components/guest-auth-provider";
import { Button } from "@/components/ui/button";

export type CheckState = "checking" | "ok" | "fail";
export interface Check {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

/** Loads the video's metadata in a detached element. Resolves with its length in ms. */
export function readVideoMs(src: string, timeoutMs = 10_000): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const timer = window.setTimeout(() => reject(new Error("timed out")), timeoutMs);
    v.onloadedmetadata = () => {
      window.clearTimeout(timer);
      resolve(Math.round(v.duration * 1000));
    };
    v.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("the browser cannot decode it"));
    };
    v.src = src;
  });
}

const PILL: Record<CheckState, string> = {
  checking: "border-line text-muted",
  ok: "border-line-strong text-foreground",
  fail: "border-danger text-danger",
};
const WORD: Record<CheckState, string> = { checking: "Checking", ok: "OK", fail: "Fix this" };

/**
 * Pre-recording checks (step 3 of the product plan). Each row is one thing that can spoil a take.
 * "Reset and start recording" forgets this tab's changes and opens the dashboard in the
 * recording view.
 */
export function Preflight({
  scenarioId,
  requestedId,
  title,
  video,
  readVideo = readVideoMs,
}: {
  scenarioId: string | null;
  requestedId: string;
  title: string | null;
  video: { path: string; durationMs: number } | null;
  readVideo?: (src: string) => Promise<number>;
}) {
  const demo = useDemoApi();
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    const set = (c: Check) => setChecks((all) => [...all.filter((x) => x.id !== c.id), c]);
    setChecks([]);

    set(
      scenarioId && scenarioId === requestedId
        ? {
            id: "scenario",
            label: "Scenario",
            state: "ok",
            detail: `${scenarioId}: ${title ?? ""}`,
          }
        : {
            id: "scenario",
            label: "Scenario",
            state: "fail",
            detail: `SLEUTH_DEMO_SCENARIO is "${requestedId}", which does not exist. Using ${scenarioId ?? "none"}.`,
          },
    );

    set(
      demo
        ? {
            id: "api",
            label: "In-browser API",
            state: "ok",
            detail: "Every API call is answered in this tab.",
          }
        : {
            id: "api",
            label: "In-browser API",
            state: "fail",
            detail: "Demo API missing: reload the page.",
          },
    );

    if (demo) {
      const changes = await demo.changeCount();
      set({
        id: "clean",
        label: "Clean start",
        state: changes === 0 ? "ok" : "fail",
        detail:
          changes === 0
            ? "No changes in this tab."
            : `${changes} changes in this tab. Press Reset first.`,
      });
    }

    const apiCalls = performance
      .getEntriesByType("resource")
      .filter((e) => new URL(e.name, window.location.href).pathname.startsWith("/api/")).length;
    set({
      id: "network",
      label: "No server API calls",
      state: apiCalls === 0 ? "ok" : "fail",
      detail:
        apiCalls === 0
          ? "None so far."
          : `${apiCalls} requests went to /api/. This is not a demo build.`,
    });

    if (!video) {
      set({
        id: "video",
        label: "Scenario video",
        state: "fail",
        detail: "This scenario has no video.",
      });
    } else {
      set({ id: "video", label: "Scenario video", state: "checking", detail: video.path });
      try {
        const ms = await readVideo(video.path);
        const close = Math.abs(ms - video.durationMs) <= 500;
        set({
          id: "video",
          label: "Scenario video",
          state: close ? "ok" : "fail",
          detail: close
            ? `Decodes, ${(ms / 1000).toFixed(1)} s.`
            : `Decodes, but is ${(ms / 1000).toFixed(1)} s, not ${(video.durationMs / 1000).toFixed(1)} s.`,
        });
      } catch (e: unknown) {
        set({
          id: "video",
          label: "Scenario video",
          state: "fail",
          detail: `Cannot play ${video.path}: ${e instanceof Error ? e.message : "unknown error"}.`,
        });
      }
    }

    await document.fonts.ready;
    // next/font gives the display font a generated family name: read it off this page's heading.
    const heading = document.querySelector("h1");
    const family = heading ? (getComputedStyle(heading).fontFamily.split(",")[0] ?? "") : "";
    const bare = (s: string) => s.trim().replace(/^["']|["']$/g, "");
    const fontsOk = [...document.fonts].some(
      (f) => bare(f.family) === bare(family) && f.status === "loaded",
    );
    set({
      id: "fonts",
      label: "Fonts",
      state: fontsOk ? "ok" : "fail",
      detail: fontsOk
        ? "Display font loaded."
        : "The display font is not loaded yet. Reload, then check again.",
    });

    const w = window.innerWidth;
    const h = window.innerHeight;
    set({
      id: "viewport",
      label: "Window size",
      state: w >= 1280 && h >= 720 ? "ok" : "fail",
      detail: `${w} x ${h}. Record at 1920 x 1080 or at least 1280 x 720, at 100% zoom.`,
    });
  }, [demo, readVideo, requestedId, scenarioId, title, video]);

  useEffect(() => {
    const first = window.setTimeout(() => void run(), 0);
    return () => window.clearTimeout(first);
  }, [run]);

  const start = async () => {
    if (!demo || busy) return;
    setBusy(true);
    await demo.reset();
    window.location.assign("/?rec=1");
  };

  const order = ["scenario", "api", "clean", "network", "video", "fonts", "viewport"];
  const sorted = [...checks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const allOk = sorted.length === order.length && sorted.every((c) => c.state === "ok");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl text-foreground">Demo pre-flight</h1>
      <p className="mt-2 text-muted">
        Run this before every take. &quot;Clean start&quot; turns OK after a reset. The recording
        view hides the reset button and stops every animation; leave it with <code>?rec=0</code>.
      </p>
      <ul className="mt-6 space-y-2" aria-label="Checks" data-testid="preflight-checks">
        {sorted.map((c) => (
          <li
            key={c.id}
            data-check={c.id}
            data-state={c.state}
            className="panel flex items-start gap-3 p-3"
          >
            <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${PILL[c.state]}`}>
              {WORD[c.state]}
            </span>
            <span>
              <span className="font-medium text-foreground">{c.label}</span>
              <span className="block text-sm text-muted">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm" role="status" data-testid="preflight-summary">
        {allOk ? "All checks passed. Ready to record." : "Not ready yet."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void run()}>
          Check again
        </Button>
        <Button size="sm" disabled={!demo || busy} onClick={() => void start()}>
          {busy ? "Resetting..." : "Reset and start recording"}
        </Button>
      </div>
    </div>
  );
}
