"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ProcessingJob } from "@sleuth/contracts";

export type NotifyPermission = "unsupported" | "default" | "granted" | "denied";

export interface DoneAlertPorts {
  doc: Pick<Document, "title" | "hidden" | "addEventListener" | "removeEventListener">;
  notify: {
    permission: () => NotifyPermission;
    request: () => Promise<NotifyPermission>;
    show: (title: string, body: string) => void;
  };
}

function browserPorts(): DoneAlertPorts {
  const N = typeof window !== "undefined" && "Notification" in window ? window.Notification : null;
  return {
    doc: document,
    notify: {
      permission: () => (N ? (N.permission as NotifyPermission) : "unsupported"),
      request: async () =>
        N ? ((await N.requestPermission()) as NotifyPermission) : "unsupported",
      show: (title, body) => {
        if (N && N.permission === "granted") new N(title, { body, tag: "sleuth-analysis" });
      },
    },
  };
}

/** The permission changes only through `ask` on this page, which sets state itself. */
const noSubscribe = () => () => undefined;

const finished = (j: ProcessingJob | null) =>
  j !== null && (j.status === "succeeded" || j.status === "failed");

/**
 * Tells a person who left the tab that their analysis finished (step 9 of the product plan):
 * the tab title changes until they come back, and, only if they asked for it, the browser shows
 * a notification. Nothing is sent anywhere; it reacts to the job state the page already polls.
 */
export function useDoneAlert(job: ProcessingJob | null, ports?: DoneAlertPorts) {
  const p = useRef<DoneAlertPorts | null>(ports ?? null);
  // What the person answered on this page; before that, the browser's current setting. The
  // server render always says "unsupported", so the first client render matches it.
  const [asked, setAsked] = useState<NotifyPermission | null>(null);
  const current = useSyncExternalStore(
    noSubscribe,
    () => (p.current ??= browserPorts()).notify.permission(),
    () => "unsupported" as NotifyPermission,
  );
  const permission = asked ?? current;
  const lastStatus = useRef<string | null>(null);

  useEffect(() => {
    const ports = (p.current ??= browserPorts());
    if (!job) return;
    const was = lastStatus.current;
    lastStatus.current = `${job.id}:${job.status}`;
    // Only a change seen on this page counts: a job that was already done on load is not news.
    if (
      !finished(job) ||
      was === null ||
      was === lastStatus.current ||
      !was.startsWith(`${job.id}:`)
    )
      return;
    if (!ports.doc.hidden) return;
    const ok = job.status === "succeeded";
    const original = ports.doc.title;
    ports.doc.title = `${ok ? "Analysis done" : "Analysis failed"} - ${original}`;
    ports.notify.show(
      ok ? "SLEUTH: analysis done" : "SLEUTH: analysis failed",
      ok ? "Your findings are ready to review." : "Open the project to see why and try again.",
    );
    const back = () => {
      if (ports.doc.hidden) return;
      ports.doc.title = original;
      ports.doc.removeEventListener("visibilitychange", back);
    };
    ports.doc.addEventListener("visibilitychange", back);
    return () => ports.doc.removeEventListener("visibilitychange", back);
  }, [job]);

  const ask = useCallback(async () => {
    const ports = (p.current ??= browserPorts());
    setAsked(await ports.notify.request());
  }, []);

  return { permission, ask };
}
