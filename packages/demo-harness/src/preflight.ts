/**
 * Checks to run before every take. Each returns a plain result, so any UI can show them. They run
 * in the browser.
 */
export type CheckState = "checking" | "ok" | "fail";
export interface Check {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
}

/** Loads a video's metadata in a detached element. Resolves with its length in ms. */
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

/** Does the video decode, at about the expected length? */
export async function checkVideo(
  path: string,
  expectedMs: number,
  read: (src: string) => Promise<number> = readVideoMs,
): Promise<Check> {
  try {
    const ms = await read(path);
    const close = Math.abs(ms - expectedMs) <= 500;
    return {
      id: "video",
      label: "Scenario video",
      state: close ? "ok" : "fail",
      detail: close
        ? `Decodes, ${(ms / 1000).toFixed(1)} s.`
        : `Decodes, but is ${(ms / 1000).toFixed(1)} s, not ${(expectedMs / 1000).toFixed(1)} s.`,
    };
  } catch (e: unknown) {
    return {
      id: "video",
      label: "Scenario video",
      state: "fail",
      detail: `Cannot play ${path}: ${e instanceof Error ? e.message : "unknown error"}.`,
    };
  }
}

/** Requests this page made to a server API so far (a demo build should make none). */
export function serverApiCalls(prefix = "/api/"): number {
  return performance
    .getEntriesByType("resource")
    .filter((e) => new URL(e.name, window.location.href).pathname.startsWith(prefix)).length;
}

/** Has the font of this page's first heading loaded? (next/font gives it a generated name.) */
export async function headingFontLoaded(): Promise<boolean> {
  await document.fonts.ready;
  const heading = document.querySelector("h1");
  const family = heading ? (getComputedStyle(heading).fontFamily.split(",")[0] ?? "") : "";
  const bare = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  // forEach, not spread: FontFaceSet iteration needs the DOM.Iterable lib in every consumer.
  let loaded = false;
  document.fonts.forEach((f) => {
    if (bare(f.family) === bare(family) && f.status === "loaded") loaded = true;
  });
  return loaded;
}

/** Is the window at least `minW` x `minH`? */
export function checkViewport(minW = 1280, minH = 720): Check {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    id: "viewport",
    label: "Window size",
    state: w >= minW && h >= minH ? "ok" : "fail",
    detail: `${w} x ${h}. Record at 1920 x 1080 or at least ${minW} x ${minH}, at 100% zoom.`,
  };
}
