import * as schema from "@teacher-os/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
	validateUpdateUserImage,
	validateUpdateUserName,
} from "./avatar-policy";
import type { Mailer } from "./mail/mailer";
import { verificationEmailTemplate } from "./mail/verification-email-template";
import {
	authBaseURL,
	authCookiePrefix,
	crossSubDomainCookieDomain,
} from "./topology";

/**
 * Drizzle sqlite instance handed to better-auth's adapter — the production
 * worker passes its D1 database, tests and the E2E boot shim pass libsql.
 * NOTE: this resolves to a loose type (better-auth exports no tight
 * constraint), so driver compatibility is proven by the round-trip test and
 * E2E, not by the compiler; runtime behavior is what this type promises.
 */
export type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

export interface CreateAuthInput {
	db: AuthDatabase;
	corsOrigin: string | string[];
	secret: string;
	/** API origin; authBaseURL() appends the /api/auth mount path. */
	baseURL: string;
	/** Dot-prefixed parent domain enables cross-subdomain cookies; omit for per-host. */
	cookieDomain?: string;
	/**
	 * Namespace prefix for every auth cookie name (advanced.cookiePrefix).
	 * Non-prod members of the prod cookie zone set "teacheros-staging" so their
	 * cookies can never be shadowed by same-name prod-zone cookies (issue #125);
	 * omit for the default `better-auth` namespace (prod/local posture).
	 */
	cookiePrefix?: string;
	googleClientId: string;
	googleClientSecret: string;
	mailer: Mailer;
}

export function createAuth(input: CreateAuthInput) {
	const cookieDomain = crossSubDomainCookieDomain(input.cookieDomain);
	const cookiePrefix = authCookiePrefix(input.cookiePrefix);

	return betterAuth({
		database: drizzleAdapter(input.db, {
			provider: "sqlite",

			schema: schema,
		}),
		trustedOrigins: Array.isArray(input.corsOrigin)
			? input.corsOrigin
			: [input.corsOrigin],
		socialProviders: {
			google: {
				clientId: input.googleClientId,
				clientSecret: input.googleClientSecret,
			},
		},
		emailAndPassword: {
			enabled: true,
		},
		emailVerification: {
			sendVerificationEmail: async ({ user, url }, request) => {
				const { html, text } = verificationEmailTemplate({ url });
				// Đường "Gửi lại" (/send-verification-email): để lỗi ném ra ngoài —
				// Better-Auth sẽ trả lỗi về client để UI hiển thị (email-verification.mjs:109-117).
				// Đường sign-up: nuốt lỗi (D3 fail-open) — đăng ký không được chết vì mailer.
				const isResendPath = Boolean(
					request &&
						new URL(request.url).pathname.endsWith("/send-verification-email"),
				);
				try {
					await input.mailer.send({
						to: user.email,
						subject: "Xác thực email TeacherOS của bạn",
						html,
						text,
					});
				} catch (error) {
					if (isResendPath) throw error;
					console.error("Failed to send verification email", {
						email: user.email,
						error,
					});
				}
			},
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			expiresIn: 60 * 60,
		},
		secret: input.secret,
		baseURL: authBaseURL(input.baseURL),
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== "/update-user") return;
				const body = (ctx.body ?? {}) as Record<string, unknown>;
				const message =
					validateUpdateUserName(body.name) ??
					validateUpdateUserImage(body.image);
				if (message) {
					throw new APIError("BAD_REQUEST", { message });
				}
			}),
		},
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
			// Cross-subdomain cookies (app.<domain> <-> api.<domain>) are enabled
			// only when cookieDomain holds a dot-prefixed parent domain; workers.dev
			// and local deployments keep per-host cookies.
			...(cookieDomain && {
				crossSubDomainCookies: {
					enabled: true,
					domain: cookieDomain,
				},
			}),
			// Stage-scoped cookie namespace (issue #125): names every auth cookie
			// `${prefix}.${name}` so non-prod members of the prod cookie zone can
			// never be shadowed by same-name prod-zone cookies. Omitted => the
			// default `better-auth` namespace (prod/local, byte-identical).
			...(cookiePrefix && { cookiePrefix }),
		},
	});
}

/** The configured better-auth instance — for callers that hold one auth
 * (e.g. getSessionUser) instead of constructing per request. */
export type Auth = ReturnType<typeof createAuth>;
