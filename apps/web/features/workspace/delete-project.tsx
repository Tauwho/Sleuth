"use client";

import { useState } from "react";
import { useApiClient } from "@/components/guest-auth-provider";
import { Button } from "@/components/ui/button";
import type { ApiClient } from "@/lib/api-client";

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The project could not be deleted.";
}

/** Default navigation; tests pass their own. */
function goTo(path: string) {
  window.location.assign(path);
}

/**
 * Delete this project and its stored videos (step 10). Two steps: the first click only asks.
 * Shown for your own projects, never for the demo.
 */
export function DeleteProject({
  projectId,
  projectName,
  client,
  navigate = goTo,
}: {
  projectId: string;
  projectName: string;
  client?: ApiClient;
  navigate?: (path: string) => void;
}) {
  const shared = useApiClient();
  const api = client ?? shared;
  const [phase, setPhase] = useState<"idle" | "confirm" | "deleting">("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const remove = async () => {
    if (phase === "deleting") return;
    setPhase("deleting");
    setError(undefined);
    try {
      await api.deleteProject(projectId);
      navigate("/");
    } catch (e: unknown) {
      setError(messageOf(e));
      setPhase("confirm");
    }
  };

  return (
    <div className="mt-3 text-sm" data-testid="delete-project">
      {phase === "idle" ? (
        <Button size="sm" variant="outline" onClick={() => setPhase("confirm")}>
          Delete project
        </Button>
      ) : (
        <div
          role="group"
          aria-label="Confirm delete"
          className="rounded-md border border-danger p-3"
        >
          <p className="text-foreground">
            Delete &quot;{projectName}&quot; and its videos? This cannot be undone.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={phase === "deleting"} onClick={() => void remove()}>
              {phase === "deleting" ? "Deleting..." : "Yes, delete it"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={phase === "deleting"}
              onClick={() => setPhase("idle")}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-danger">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
