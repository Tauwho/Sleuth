import { describe, expect, it } from "vitest";
import { readRecMode, REC_KEY } from "./rec-mode";

function store() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("readRecMode", () => {
  it("is off by default", () => {
    expect(readRecMode("", store())).toBe(false);
  });

  it("?rec=1 turns it on and remembers it for the tab", () => {
    const s = store();
    expect(readRecMode("?rec=1", s)).toBe(true);
    expect(s.data.get(REC_KEY)).toBe("1");
    expect(readRecMode("", s)).toBe(true);
  });

  it("?rec=0 turns it off again", () => {
    const s = store();
    readRecMode("?rec=1", s);
    expect(readRecMode("?rec=0", s)).toBe(false);
    expect(readRecMode("", s)).toBe(false);
  });

  it("ignores other values and works with no storage", () => {
    expect(readRecMode("?rec=yes", null)).toBe(false);
    expect(readRecMode("?rec=1", null)).toBe(true);
  });
});
