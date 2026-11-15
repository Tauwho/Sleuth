/**
 * Recording view. `?rec=1` turns it on for this tab, `?rec=0` turns it off. While it is on, the
 * page has no animations, transitions or blinking caret and no Next.js dev overlay, so every take
 * looks the same. The app hides its own extra controls (a reset button, say) while it is on.
 */
export const DEFAULT_REC_KEY = "demo-harness:rec";

/** Reads `?rec=` from the URL first, then this tab's saved choice. */
export function readRecMode(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  key: string = DEFAULT_REC_KEY,
): boolean {
  const param = new URLSearchParams(search).get("rec");
  if (param === "1" || param === "0") {
    try {
      storage?.setItem(key, param);
    } catch {
      // Storage blocked: the URL still decides for this page.
    }
    return param === "1";
  }
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** The CSS the recording view adds; put it in a <style> while the view is on. */
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
