import { describe, expect, it } from "vitest";
import { safeCode } from "./api";
import { webDatabaseUrl } from "./data-source";

const SESSION =
  "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";

describe("webDatabaseUrl (N5)", () => {
  it("keeps the URL as given by default", () => {
    expect(webDatabaseUrl(SESSION, undefined)).toBe(SESSION);
    expect(webDatabaseUrl(SESSION, "session")).toBe(SESSION);
  });

  it("moves to the transaction pooler only when asked", () => {
    expect(webDatabaseUrl(SESSION, "transaction")).toBe(SESSION.replace(":5432/", ":6543/"));
  });

  it("leaves other databases and ports alone", () => {
    for (const url of [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "postgresql://u:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
      SESSION.replace(":5432/", ":6543/"),
      "not a url",
    ]) {
      expect(webDatabaseUrl(url, "transaction")).toBe(url);
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

describe("x-sleuth-error on a 500", () => {
  it("carries only the error name and its short code", async () => {
    const { endpoint } = await import("./api");
    const boom = Object.assign(new Error("password authentication failed for user secret"), {
      name: "PostgresError",
      code: "28P01",
    });
    const handler = endpoint("listProjects", async () => {
      throw boom;
    });
    const res = await handler(new Request("http://x/api/v1/projects"), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(500);
    expect(res.headers.get("x-sleuth-error")).toBe("PostgresError 28P01");
    expect(await res.text()).not.toContain("password");
  });
});
