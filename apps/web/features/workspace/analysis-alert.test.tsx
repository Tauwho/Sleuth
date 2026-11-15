import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingJob } from "@sleuth/contracts";
import { AnalysisPanel } from "./analysis-panel";
import type { DoneAlertPorts, NotifyPermission } from "./use-done-alert";

function job(status: ProcessingJob["status"]): ProcessingJob {
  return {
    id: "j1",
    projectId: "p1",
    kind: "analysis",
    status,
    attempts: status === "queued" ? 0 : 1,
    maxAttempts: 3,
    lockedBy: null,
    heartbeatAt: null,
    error: status === "failed" ? "media: failed" : null,
    payload: { assetVersionId: "av1", scriptVersionId: "sv1" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function ports(hidden: boolean, permission: NotifyPermission = "granted") {
  const listeners: (() => void)[] = [];
  const doc = {
    title: "ProofPay | SLEUTH",
    hidden,
    addEventListener: (_: string, fn: () => void) => void listeners.push(fn),
    removeEventListener: vi.fn(),
  };
  const shown: string[] = [];
  let perm = permission;
  const p = {
    doc: doc as unknown as DoneAlertPorts["doc"],
    notify: {
      permission: () => perm,
      request: vi.fn(async () => {
        perm = "granted";
        return perm;
      }),
      show: (title: string) => void shown.push(title),
    },
  };
  return { p, doc, shown, comeBack: () => listeners.forEach((fn) => fn()) };
}

async function run(answers: ProcessingJob[], alertPorts: DoneAlertPorts) {
  const fetchJob = vi.fn(async () => answers.shift() ?? job("succeeded"));
  render(
    <AnalysisPanel
      readOnly={false}
      evidence={[]}
      findings={[]}
      startAnalysis={vi.fn(async () => job("queued"))}
      fetchJob={fetchJob}
      onSucceeded={vi.fn()}
      alertPorts={alertPorts}
    />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
  // Let the queued job render before the first check, as it does in a browser.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
  }
}

describe("job progress and the done alert (step 9)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the stage the real job is in", async () => {
    const { p } = ports(false);
    render(
      <AnalysisPanel
        readOnly={false}
        evidence={[]}
        findings={[]}
        startAnalysis={vi.fn(async () => job("queued"))}
        fetchJob={vi.fn(async () => job("running"))}
        onSucceeded={vi.fn()}
        alertPorts={p}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const stages = screen.getByRole("list", { name: "Analysis progress" });
    expect(stages.querySelector("[aria-current='step']")).toHaveTextContent("Queued");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      screen
        .getByRole("list", { name: "Analysis progress" })
        .querySelector("[aria-current='step']"),
    ).toHaveTextContent("Worker running");
  });

  it("changes the tab title and notifies when it finishes while the tab is hidden", async () => {
    const { p, doc, shown, comeBack } = ports(true);
    await run([job("running"), job("succeeded")], p);
    expect(doc.title).toBe("Analysis done - ProofPay | SLEUTH");
    expect(shown).toEqual(["SLEUTH: analysis done"]);
    doc.hidden = false;
    comeBack();
    expect(doc.title).toBe("ProofPay | SLEUTH");
  });

  it("does nothing while the person is looking at the tab", async () => {
    const { p, doc, shown } = ports(false);
    await run([job("succeeded")], p);
    expect(doc.title).toBe("ProofPay | SLEUTH");
    expect(shown).toEqual([]);
  });

  it("says so when it failed", async () => {
    const { p, doc, shown } = ports(true);
    await run([job("failed")], p);
    expect(doc.title).toBe("Analysis failed - ProofPay | SLEUTH");
    expect(shown).toEqual(["SLEUTH: analysis failed"]);
  });

  it("asks for notification permission only when the person presses the button", async () => {
    const { p } = ports(false, "default");
    render(
      <AnalysisPanel
        readOnly={false}
        evidence={[]}
        findings={[]}
        startAnalysis={vi.fn(async () => job("queued"))}
        fetchJob={vi.fn(async () => job("queued"))}
        onSucceeded={vi.fn()}
        alertPorts={p}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(p.notify.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Notify me when it is done" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(p.notify.request).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("notify-on")).toBeInTheDocument();
  });
});
