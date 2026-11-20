import { env } from "cloudflare:workers";

type OptionalSecrets = {
  GROQ_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  RESEND_API_KEY?: string;
};

function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export type AiProviderName = "groq" | "workers-ai" | "openai" | "none";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Typed, validated view over Worker vars / secrets. */
export function getConfig() {
  const optional = env as unknown as OptionalSecrets;
  const aiProvider = (["groq", "workers-ai", "openai", "none"] as const).includes(
    env.AI_PROVIDER as AiProviderName,
  )
    ? (env.AI_PROVIDER as AiProviderName)
    : "none";

  // Email sending degrades safely: "resend" without an API key resolves to
  // "none", and verification turns itself off when no provider is usable, so
  // a missing secret can never lock users out of the site.
  const rawEmailProvider = env.EMAIL_PROVIDER as string | undefined;
  const emailProvider =
    rawEmailProvider === "resend" && optional.RESEND_API_KEY
      ? ("resend" as const)
      : rawEmailProvider === "console"
        ? ("console" as const)
        : ("none" as const);
  const rawVerification = env.EMAIL_VERIFICATION as string | undefined;
  const emailVerification =
    (rawVerification === "on" || rawVerification === "required") &&
    emailProvider !== "none"
      ? rawVerification
      : ("off" as const);

  return {
    emailProvider,
    emailFrom: (env.EMAIL_FROM as string | undefined) || "Event Share <no-reply@localhost>",
    resendApiKey: optional.RESEND_API_KEY,
    /** "off" = disabled / "on" = send + record / "required" = block unverified logins */
    emailVerification,
    baseUrl: env.BETTER_AUTH_URL,
    timeZone: env.APP_TIMEZONE || "Asia/Tokyo",
    signupMode: (env.SIGNUP_MODE as string) === "domain" ? ("domain" as const) : ("open" as const),
    schoolEmailDomains: list(env.SCHOOL_EMAIL_DOMAINS),
    aiProvider,
    aiModel: env.AI_MODEL,
    groqApiKey: optional.GROQ_API_KEY,
    openaiApiKey: optional.OPENAI_API_KEY,
    openaiBaseUrl: optional.OPENAI_BASE_URL || "https://api.openai.com/v1",
  } as const;
}

export type AppConfig = ReturnType<typeof getConfig>;
