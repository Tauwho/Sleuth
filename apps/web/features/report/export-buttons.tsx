"use client";

import { useDemoApi } from "@/components/guest-auth-provider";
import { Button } from "@/components/ui/button";

/**
 * CSV and printable HTML from the existing export endpoints, and a Print button that prints
 * this page. The print styles in `globals.css` give a light page with no animation.
 * In demo mode the report is built in the browser (ADR 0010), so the links become buttons that
 * hand the same file over without a request.
 */
export function ExportButtons({ projectId, print = () => window.print() }: { projectId: string; print?: () => void }) {
  const demo = useDemoApi();
  const base = `/api/v1/projects/${encodeURIComponent(projectId)}`;
  const link =
    "inline-flex h-8 items-center rounded-md border border-line-strong px-3 text-sm text-foreground hover:bg-raised";

  const fromDemo = async (kind: "csv" | "html") => {
    if (!demo) return;
    const res = await demo.fetch(`${base}/report.${kind}`);
    const blob = new Blob([await res.text()], {
      type: kind === "csv" ? "text/csv;charset=utf-8" : "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    if (kind === "csv") {
      const a = document.createElement("a");
      a.href = url;
      a.download = "sleuth-report.csv";
      a.click();
    } else {
      window.open(url, "_blank", "noopener");
    }
    // Give the browser time to start the download or open the tab before the URL is freed.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <section aria-labelledby="export-heading" className="panel p-5 print:hidden">
      <h2 id="export-heading" className="font-display text-xl text-foreground">
        Export
      </h2>
      <p className="mt-1 text-sm text-muted">
        The exports hold the same report: seal status, coverage, findings, reshoots and outside proof. They never hold
        transcripts, frames or links to the video.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {demo ? (
          <>
            <Button size="sm" variant="outline" onClick={() => void fromDemo("csv")}>
              Download CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => void fromDemo("html")}>
              Open printable HTML
            </Button>
          </>
        ) : (
          <>
            <a className={link} href={`${base}/report.csv`} download>
              Download CSV
            </a>
            <a className={link} href={`${base}/report.html`} target="_blank" rel="noopener">
              Open printable HTML
            </a>
          </>
        )}
        <Button size="sm" variant="outline" onClick={print}>
          Print
        </Button>
      </div>
    </section>
  );
}
