import { describe, expect, it } from "vitest";
import { safeCode } from "./api";
import { webDatabaseUrl } from "./data-source";

const SESSION =
  "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";

describe("webDatabaseUrl (N5)", () => {
  it("moves a Supabase session-pooler URL to the transaction pooler", () => {
    expect(webDatabaseUrl(SESSION, undefined)).toBe(SESSION.replace(":5432/", ":6543/"));
  });

  it("keeps the URL with SLEUTH_DB_POOL_MODE=session", () => {
    expect(webDatabaseUrl(SESSION, "session")).toBe(SESSION);
  });

  it("leaves other databases and ports alone", () => {
    for (const url of [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "postgresql://u:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      SESSION.replace(":5432/", ":6543/"),
      "not a url",
    ]) {
      expect(webDatabaseUrl(url, undefined)).toBe(url);
    }
  });
});

describe("safeCode", () => {
  it("keeps short machine codes and drops everything else", () => {
    expect(safeCode({ code: "EMAXCONNSESSION" })).toBe("EMAXCONNSESSION");
    expect(safeCode({ code: "53300" })).toBe("53300");
    expect(safeCode({ code: "password authentication failed for user x" })).toBe("-");
    expect(safeCode(new Error("boom"))).toBe("-");
    expect(safeCode(null)).toBe("-");
  });
});
