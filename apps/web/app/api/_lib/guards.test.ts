import { describe, expect, it } from "vitest";
import { guardsFromEnv } from "./data-source";

describe("guardsFromEnv", () => {
  it("Supabase mode has free-tier defaults", () => {
    expect(guardsFromEnv({} as NodeJS.ProcessEnv, true)).toEqual({
      maxProjectsPerGuest: 2,
      maxUploadsPerGuest: 2,
      globalDailyAnalysisLimit: 50,
    });
  });

  it("fixture mode has no limits unless set", () => {
    expect(guardsFromEnv({} as NodeJS.ProcessEnv, false)).toEqual({
      maxProjectsPerGuest: undefined,
      maxUploadsPerGuest: undefined,
      globalDailyAnalysisLimit: undefined,
    });
  });

  it("reads the variables and ignores bad values", () => {
    const env = {
      MAX_PROJECTS_PER_GUEST: "4",
      MAX_UPLOADS_PER_GUEST: "zero",
      GLOBAL_DAILY_ANALYSIS_LIMIT: "-3",
    } as unknown as NodeJS.ProcessEnv;
    expect(guardsFromEnv(env, true)).toEqual({
      maxProjectsPerGuest: 4,
      maxUploadsPerGuest: 2,
      globalDailyAnalysisLimit: 50,
    });
  });
});
