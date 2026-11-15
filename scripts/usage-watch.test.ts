import { describe, expect, it } from "vitest";
import { report, STORAGE_LIMIT_BYTES } from "./usage-watch";

const base = {
  storageBytes: 0,
  storageFiles: 0,
  databaseBytes: 20 * 1024 ** 2,
  guestProjects: 3,
  teamProjects: 1,
  analysesLast7Days: 12,
};

describe("usage-watch report (N9)", () => {
  it("prints numbers only and passes under 70%", () => {
    const r = report({ ...base, storageBytes: 300 * 1024 ** 2, storageFiles: 7 });
    expect(r.over).toBe(false);
    expect(r.lines[0]).toBe("storage: 300.0 MB of 1024 MB (29.3%) in 7 files");
    expect(r.lines[1]).toBe("database: 20.0 MB of 500 MB (4.0%)");
    expect(r.lines[2]).toBe("projects: 3 guest, 1 signed-up (demo not counted)");
  });

  it("fails above 70% of storage or of the database", () => {
    expect(report({ ...base, storageBytes: Math.ceil(STORAGE_LIMIT_BYTES * 0.71) }).over).toBe(
      true,
    );
    expect(report({ ...base, databaseBytes: 360 * 1024 ** 2 }).over).toBe(true);
    expect(report({ ...base, storageBytes: Math.floor(STORAGE_LIMIT_BYTES * 0.7) }).over).toBe(
      false,
    );
  });
});
