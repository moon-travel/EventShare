/**
 * Minimal pluggable email sending.
 *
 * - `console`: logs the message instead of sending (local development).
 * - `resend` : Resend HTTP API (https://resend.com/docs/api-reference).
 *
 * Adding another provider (e.g. Cloudflare Email Service) only requires a new
 * case in `sendEmail`; callers depend on nothing but `EmailSettings`.
 */

export type EmailSettings = {
  emailProvider: "console" | "resend" | "none";
  emailFrom: string;
  resendApiKey?: string;
};

export type EmailMessage = { to: string; subject: string; text: string };

export function buildVerificationEmail(input: { name: string; url: string }) {
  return {
    subject: "【Event Share】メールアドレスの確認",
    text: [
      `${input.name} さん`,
      "",
      "Event Share へのご登録ありがとうございます。",
      "以下のリンクを開いて、メールアドレスの確認を完了してください。",
      "",
      input.url,
      "",
      "このリンクの有効期限は24時間です。",
      "心当たりがない場合は、このメールを無視してください。",
    ].join("\n"),
  };
}

export async function sendEmail(settings: EmailSettings, message: EmailMessage) {
  switch (settings.emailProvider) {
    case "console":
      console.log(
        JSON.stringify({
          email: { to: message.to, subject: message.subject, text: message.text },
        }),
      );
      return;
    case "resend": {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${settings.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: settings.emailFrom,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      if (!res.ok) {
        throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
      }
      return;
    }
    case "none":
      throw new Error("Email sending is not configured (EMAIL_PROVIDER)");
  }
}
