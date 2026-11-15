"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatePanel } from "@/components/state-panel";
import { GuestSessionNote } from "@/components/guest-auth-provider";
import type { ApiClient } from "@/lib/api-client";
import type { GuestAuth } from "@/lib/guest-auth";
import { formatLastChange, useDashboard, type CreatePhase, type OpenCount } from "./use-dashboard";

const CREATE_LABEL: Record<CreatePhase, string> = {
  idle: "Copy the demo",
  signing_in: "Starting a guest session...",
  creating: "Creating...",
};

const SMALL_WORDS = new Set(["a", "an", "of", "the", "and", "for"]);

/** Up to two initials for the poster: "Copy of ProofPay demo" gives "CP". */
export function initialsOf(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  const letters = (kept.length > 0 ? kept : words)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** A film frame with sprocket holes, carrying the project's initials. Decorative. */
function FilmPoster({ initials }: { initials: string }) {
  return (
    <div className="relative h-24 w-20 flex-none" aria-hidden="true" data-testid="film-poster">
      <svg
        viewBox="0 0 80 96"
        className="absolute inset-0 h-full w-full"
        fill="none"
        focusable="false"
      >
        <rect
          x="0.5"
          y="0.5"
          width="79"
          height="95"
          rx="2"
          className="fill-background stroke-line-strong"
        />
        {[8, 22, 36, 50, 64, 78].map((y) => (
          <g key={y} className="fill-raised stroke-line">
            <rect x="4" y={y} width="6" height="8" rx="1" />
            <rect x="70" y={y} width="6" height="8" rx="1" />
          </g>
        ))}
        <rect x="14" y="8" width="52" height="80" className="fill-surface stroke-line" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-3xl text-gold">
        {initials}
      </span>
    </div>
  );
}

function OpenCountText({ count }: { count: OpenCount | undefined }) {
  if (!count || count.state === "loading") return <>Counting open findings...</>;
  if (count.state === "error") return <>Open findings unavailable (could not load)</>;
  return (
    <>
      <span className="font-display text-4xl leading-none text-foreground tabular-nums">
        {count.count}
      </span>{" "}
      <span>open {count.count === 1 ? "finding" : "findings"}</span>
    </>
  );
}

/**
 * Project list with loading, empty, error (retry) and done states.
 * Rows stay in the API order (the demo first, then the most recent change) and show
 * "Last change" from `project.updatedAt`.
 * Open findings come from listFindings; a failed load shows no number.
 */
export function ProjectList({
  client,
  auth,
  navigate,
}: {
  client?: ApiClient;
  auth?: GuestAuth;
  /** Tests only: where a new blank project opens. */
  navigate?: (path: string) => void;
}) {
  const [blankName, setBlankName] = useState("");
  const [busyKind, setBusyKind] = useState<"copy" | "blank">("copy");
  const nameId = useId();
  const {
    status,
    projects,
    openCounts,
    errorMessage,
    creating,
    createPhase,
    createError,
    reload,
    createProject,
    createBlankProject,
  } = useDashboard(client, auth, navigate);

  return (
    <div>
      <StatePanel
        status={status}
        errorMessage={errorMessage}
        onRetry={reload}
        onCreateProject={() => void createProject()}
        creating={creating}
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id} className="panel panel-lift flex gap-4 p-4">
              <FilmPoster initials={initialsOf(project.name)} />
              <div className="min-w-0 flex-1">
                <Link
                  className="font-display text-xl text-primary-strong underline-offset-4 hover:underline"
                  href={`/projects/${encodeURIComponent(project.id)}`}
                >
                  {project.name}
                </Link>
                {project.isDemo ? (
                  <span className="mt-1 block w-fit rounded-[2px] border border-line-strong px-2 py-0.5 text-xs text-muted">
                    Public demo, read-only
                  </span>
                ) : null}
                <p className="mt-2 text-sm text-muted" data-testid="open-count">
                  <OpenCountText count={openCounts[project.id]} />
                </p>
                <p className="mt-1 text-xs text-muted">
                  Last change{" "}
                  <time dateTime={project.updatedAt}>{formatLastChange(project.updatedAt)}</time>
                </p>
                {project.isDemo ? (
                  <Link
                    href={`/projects/${encodeURIComponent(project.id)}`}
                    className="mt-3 inline-flex min-h-8 items-center rounded-[2px] border border-line-strong px-3 py-1.5 text-sm text-foreground hover:bg-raised"
                    aria-label={`Open demo: ${project.name}`}
                  >
                    Open demo
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {status === "done" ? (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="panel p-4">
                <h3 className="font-display text-lg text-foreground">Check your own video</h3>
                <p className="mt-1 text-sm text-muted">
                  Start empty, paste your script and checklist, upload your video, then run an
                  analysis.
                </p>
                <form
                  className="mt-3 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setBusyKind("blank");
                    void createBlankProject(blankName);
                  }}
                >
                  <label
                    htmlFor={nameId}
                    className="flex min-w-0 flex-1 flex-col text-sm text-foreground"
                  >
                    Project name
                    <input
                      id={nameId}
                      value={blankName}
                      onChange={(e) => setBlankName(e.currentTarget.value)}
                      maxLength={120}
                      placeholder="My demo video"
                      className="mt-1 h-8 rounded-md border border-line-strong bg-background px-2 text-sm text-foreground"
                    />
                  </label>
                  <Button type="submit" disabled={creating} aria-busy={creating}>
                    {createPhase !== "idle" && busyKind === "blank"
                      ? CREATE_LABEL[createPhase]
                      : "Start a blank project"}
                  </Button>
                </form>
              </div>
              <div className="panel p-4">
                <h3 className="font-display text-lg text-foreground">Try it on the sample</h3>
                <p className="mt-1 text-sm text-muted">
                  An editable copy of the ProofPay demo, with its results.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => {
                    setBusyKind("copy");
                    void createProject();
                  }}
                  disabled={creating}
                  aria-busy={creating}
                >
                  {CREATE_LABEL[busyKind === "copy" ? createPhase : "idle"]}
                </Button>
              </div>
            </div>
            <GuestSessionNote className="mt-2" auth={auth} />
          </>
        ) : null}
      </StatePanel>
      {createError ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {createError}
        </p>
      ) : null}
    </div>
  );
}
