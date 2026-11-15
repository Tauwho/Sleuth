import { describe, expect, it, vi } from "vitest";
import { createGuestAuth, GuestAuthError, type GuestAuthPort } from "./guest-auth";

function port(signIn: GuestAuthPort["signInAnonymously"]): GuestAuthPort {
  return {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signInAnonymously: signIn,
    signOut: async () => ({ error: null }),
  };
}

describe("guest sign-in with a CAPTCHA token (step 6)", () => {
  it("sends a fresh token with the anonymous sign-in", async () => {
    const signIn = vi.fn(async () => ({ data: { session: { user: {} } }, error: null }));
    const auth = createGuestAuth(
      () => port(signIn),
      async () => "tok-1",
    );
    await auth.ensureSession();
    expect(signIn).toHaveBeenCalledWith({ options: { captchaToken: "tok-1" } });
  });

  it("without a token source, sends no options (as before)", async () => {
    const signIn = vi.fn(async () => ({ data: { session: { user: {} } }, error: null }));
    await createGuestAuth(() => port(signIn)).ensureSession();
    expect(signIn).toHaveBeenCalledWith();
  });

  it("a failed check creates nobody and says so", async () => {
    const signIn = vi.fn(async () => ({ data: { session: { user: {} } }, error: null }));
    const auth = createGuestAuth(
      () => port(signIn),
      async () => {
        throw new Error("turnstile_failed");
      },
    );
    await expect(auth.ensureSession()).rejects.toMatchObject({ code: "captcha" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("Supabase refusing the token reads as a failed check", async () => {
    const signIn = vi.fn(async () => ({
      data: { session: null },
      error: { code: "captcha_failed", message: "captcha protection: request disallowed" },
    }));
    const auth = createGuestAuth(
      () => port(signIn),
      async () => "bad",
    );
    const error = await auth.ensureSession().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GuestAuthError);
    expect((error as GuestAuthError).code).toBe("captcha");
  });
});
