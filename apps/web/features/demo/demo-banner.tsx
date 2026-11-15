/**
 * Demo mode's notice (ADR 0010). It is on every page, so no screenshot or recording of the demo
 * can be mistaken for a live analysis.
 */
export function DemoBanner({ disclosure }: { disclosure: string }) {
  return (
    <div
      role="note"
      aria-label="Demo mode"
      data-testid="demo-banner"
      className="border-b border-line bg-surface px-4 py-2 text-center text-sm text-muted print:hidden"
    >
      {disclosure}
    </div>
  );
}
