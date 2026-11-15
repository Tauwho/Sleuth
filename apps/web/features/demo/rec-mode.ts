import { readRecMode as readHarnessRecMode } from "@sleuth/demo-harness";

export { REC_CSS } from "@sleuth/demo-harness";

/** SLEUTH keeps the recording-view choice under its own key (the harness default is generic). */
export const REC_KEY = "sleuth-demo:rec";

/** `?rec=1` / `?rec=0` for this tab; see `@sleuth/demo-harness` rec-mode. */
export function readRecMode(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): boolean {
  return readHarnessRecMode(search, storage, REC_KEY);
}
