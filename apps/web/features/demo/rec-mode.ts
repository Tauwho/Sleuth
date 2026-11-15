/**
 * Recording view for demo mode (ADR 0010). `?rec=1` turns it on for this tab, `?rec=0` turns it
 * off. While it is on, the page has no animations, transitions or blinking caret, no dev
 * overlay, and no reset button, so every take looks the same.
 */
export const REC_KEY = "sleuth-demo:rec";

/** Reads `?rec=` from the URL first, then this tab's saved choice. */
export function readRecMode(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  const param = new URLSearchParams(search).get("rec");
  if (param === "1" || param === "0") {
    try {
      storage?.setItem(REC_KEY, param);
    } catch {
      // Storage blocked: the URL still decides for this page.
    }
    return param === "1";
  }
  try {
    return storage?.getItem(REC_KEY) === "1";
  } catch {
    return false;
  }
}

/** The CSS the recording view adds. Kept here, not in globals.css, so it exists only in demo mode. */
export const REC_CSS = `
html[data-rec] *, html[data-rec] *::before, html[data-rec] *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}
html[data-rec] nextjs-portal { display: none !important; }
`;
