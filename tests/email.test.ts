import { afterEach, describe, expect, it, vi } from "vitest";
import { buildVerificationEmail, sendEmail } from "~/.server/email";

describe("buildVerificationEmail", () => {
  it("includes the recipient name and verification URL", () => {
    const { subject, text } = buildVerificationEmail({
      name: "テスト太郎",
      url: "https://example.com/api/auth/verify-email?token=abc",
    });
    expect(subject).toContain("メールアドレスの確認");
    expect(text).toContain("テスト太郎 さん");
    expect(text).toContain("https://example.com/api/auth/verify-email?token=abc");
    expect(text).toContain("24時間");
  });
});

describe("sendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const message = { to: "a@example.com", subject: "件名", text: "本文" };

  it("logs instead of sending with the console provider", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await sendEmail(
      { emailProvider: "console", emailFrom: "Event Share <no-reply@localhost>" },
      message,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("a@example.com");
  });

  it("posts to the Resend API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail(
      {
        emailProvider: "resend",
        emailFrom: "Event Share <no-reply@example.com>",
        resendApiKey: "re_key",
      },
      message,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_key");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["a@example.com"]);
    expect(body.from).toBe("Event Share <no-reply@example.com>");
  });

  it("throws on a Resend API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
    );
    await expect(
      sendEmail(
        { emailProvider: "resend", emailFrom: "x", resendApiKey: "bad" },
        message,
      ),
    ).rejects.toThrow("Resend API error: 401");
  });

  it("throws when no provider is configured", async () => {
    await expect(
      sendEmail({ emailProvider: "none", emailFrom: "x" }, message),
    ).rejects.toThrow("not configured");
  });
});
