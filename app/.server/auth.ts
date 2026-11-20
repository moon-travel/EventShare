import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { getConfig } from "./config";
import { createDb, schema } from "./db";
import { buildVerificationEmail, sendEmail } from "./email";
import { canSignUp, isSchoolEmail } from "./school";

function createAuth() {
  const config = getConfig();
  return betterAuth({
    appName: "Event Share",
    // Preview URLs change per branch. Trust the request host when it is this
    // Worker's workers.dev hostname or local dev; BETTER_AUTH_URL is the fallback.
    baseURL: {
      allowedHosts: ["*.workers.dev", "localhost:*", "127.0.0.1:*"],
      fallback: config.baseUrl,
    },
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
      requireEmailVerification: config.emailVerification === "required",
    },
    ...(config.emailVerification !== "off"
      ? {
          emailVerification: {
            sendOnSignUp: true,
            /** Re-send automatically when an unverified user tries to log in. */
            sendOnSignIn: config.emailVerification === "required",
            autoSignInAfterVerification: true,
            expiresIn: 60 * 60 * 24,
            sendVerificationEmail: async ({ user, url }) => {
              await sendEmail(
                config,
                { to: user.email, ...buildVerificationEmail({ name: user.name, url }) },
              );
            },
            afterEmailVerification: async (verifiedUser) => {
              // Email ownership proven: mark school affiliation as confirmed
              // when the address belongs to the school domain.
              if (isSchoolEmail(verifiedUser.email, config.schoolEmailDomains)) {
                await createDb()
                  .update(schema.user)
                  .set({ schoolVerifiedAt: new Date(), updatedAt: new Date() })
                  .where(eq(schema.user.id, verifiedUser.id));
              }
            },
          },
        }
      : {}),
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    // Auth endpoints are rate limited with the Workers Rate Limiting binding
    // (see routes/api.auth.$.ts); the built-in limiter is in-memory per isolate.
    rateLimit: { enabled: false },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    user: {
      additionalFields: {
        grade: { type: "string", required: false, input: false },
        bio: { type: "string", required: false, input: false },
        profileVisibility: {
          type: "string",
          required: false,
          input: false,
          defaultValue: "members",
        },
        schoolVerifiedAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            if (
              !canSignUp(
                newUser.email,
                config.signupMode,
                config.schoolEmailDomains,
              )
            ) {
              throw new APIError("FORBIDDEN", {
                message: "学校のメールアドレスで登録してください。",
              });
            }
            return { data: newUser };
          },
        },
      },
    },
    plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  instance ??= createAuth();
  return instance;
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<
  Awaited<ReturnType<Auth["api"]["getSession"]>>
>;
export type SessionUser = AuthSession["user"];
