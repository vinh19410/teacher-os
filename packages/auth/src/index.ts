import * as schema from "@teacher-os/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { eq } from "drizzle-orm";
import {
	validateUpdateUserImage,
	validateUpdateUserName,
} from "./avatar-policy";
import type { Mailer } from "./mail/mailer";
import { resetPasswordEmailTemplate } from "./mail/reset-password-email-template";
import { verificationEmailTemplate } from "./mail/verification-email-template";
import {
	OAUTH_APP_STATE_KEY,
	resolveRequestApp,
	resolveUserRole,
} from "./role";
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

/** Minimal structural view of the drizzle instance for the role lookup. */
interface RoleLookupDb {
	select: (fields: { role: unknown }) => {
		from: (table: unknown) => {
			where: (condition: unknown) => Promise<Array<{ role?: string | null }>>;
		};
	};
}

export interface CreateAuthInput {
	db: AuthDatabase;
	corsOrigin: string | string[];
	/**
	 * Origins of the student portal app; teacher origins are derived as
	 * corsOrigin minus studentOrigins. Sign-ups from an unknown origin default
	 * to the student role (least privilege, plan #260 D3).
	 */
	studentOrigins: string[];
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
	/**
	 * Chạy tác vụ nền sau khi response đã trả (Workers: `waitUntil`). Có thì mail
	 * đặt lại mật khẩu gửi ngoài đường request, nên thời gian phản hồi không lộ
	 * email có tài khoản hay không. Không có thì better-auth tự `await`.
	 */
	runInBackground?: (promise: Promise<unknown>) => void;
}

/** Tài khoản học viên không thể đăng nhập vào trang giáo viên (plan #260 D4). */
const ROLE_MISMATCH_STUDENT_ON_TEACHER_MESSAGE =
	"Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên.";
/** Tài khoản giáo viên không thể đăng nhập vào cổng học viên (plan #260 D4). */
const ROLE_MISMATCH_TEACHER_ON_PORTAL_MESSAGE =
	"Tài khoản giáo viên không thể đăng nhập vào cổng học viên.";

export function createAuth(input: CreateAuthInput) {
	const cookieDomain = crossSubDomainCookieDomain(input.cookieDomain);
	const cookiePrefix = authCookiePrefix(input.cookiePrefix);
	const trustedOrigins = Array.isArray(input.corsOrigin)
		? input.corsOrigin
		: [input.corsOrigin];
	const teacherOrigins = trustedOrigins.filter(
		(o) => !input.studentOrigins.includes(o),
	);

	/** App nguồn từ OAuth state (server-side stamp tại /sign-in/social). */
	async function readOAuthApp(): Promise<string | null> {
		const state = await (getOAuthState() as Promise<unknown>).catch(() => null);
		if (!state || typeof state !== "object") return null;
		const value = (state as Record<string, unknown>)[OAUTH_APP_STATE_KEY];
		return typeof value === "string" ? value : null;
	}

	async function getUserRole(userId: string): Promise<string | null> {
		const db = input.db as unknown as RoleLookupDb;
		const rows = await db
			.select({ role: schema.user.role })
			.from(schema.user)
			.where(eq(schema.user.id, userId));
		return rows[0]?.role ?? null;
	}

	/** App nguồn của request hiện tại: Origin trước, OAuth state làm fallback. */
	async function resolveRequestAppForContext(
		ctx: { request?: Request | null } | null | undefined,
	): Promise<string> {
		const oauthApp = await readOAuthApp();
		return resolveRequestApp({
			origin: ctx?.request?.headers?.get("origin") ?? null,
			oauthApp,
			studentOrigins: input.studentOrigins,
			teacherOrigins,
		});
	}

	return betterAuth({
		database: drizzleAdapter(input.db, {
			provider: "sqlite",

			schema: schema,
		}),
		trustedOrigins,
		socialProviders: {
			google: {
				clientId: input.googleClientId,
				clientSecret: input.googleClientSecret,
			},
		},
		emailAndPassword: {
			enabled: true,
			resetPasswordTokenExpiresIn: 60 * 60,
			revokeSessionsOnPasswordReset: true,
			// better-auth bọc callback này trong try/catch rồi bỏ lỗi, nên ném lỗi
			// không bao giờ tới client; lỗi gửi mail chỉ có thể được log tại đây.
			sendResetPassword: async ({ user, url }) => {
				const callbackURL = new URL(url).searchParams.get("callbackURL");
				let targetApp: string | null = null;
				try {
					targetApp = callbackURL
						? resolveRequestApp({
								origin: new URL(callbackURL).origin,
								studentOrigins: input.studentOrigins,
								teacherOrigins,
							})
						: null;
				} catch {
					targetApp = null;
				}
				// Chặn gửi link sang cổng khác role của tài khoản; response vẫn trung tính.
				if (targetApp !== resolveUserRole(await getUserRole(user.id))) return;

				const { html, text } = resetPasswordEmailTemplate({ url });
				try {
					await input.mailer.send({
						to: user.email,
						subject: "Đặt lại mật khẩu TeacherOS của bạn",
						html,
						text,
					});
				} catch (error) {
					console.error("[auth] reset-password email failed", {
						userId: user.id,
						message: error instanceof Error ? error.message : "unknown",
					});
				}
			},
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
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/sign-in/social") {
					// Server-side stamping (plan #260 D5): the OAuth state records the
					// app from the initiation POST's Origin so the callback — a GET
					// navigation without Origin — still classifies correctly, even
					// with an old client bundle. Client-sent additionalData is
					// overwritten. Merge through the returned context: assigning
					// ctx.body directly does not reach the endpoint handler (the
					// middleware context holds a copy, red-team-verified by the
					// stamping round-trip test).
					const body = (ctx.body ?? {}) as Record<string, unknown>;
					const extra = (body.additionalData ?? {}) as Record<string, unknown>;
					const appRole = resolveRequestApp({
						origin: ctx.headers?.get("origin") ?? null,
						studentOrigins: input.studentOrigins,
						teacherOrigins,
					});
					return {
						context: {
							body: {
								...body,
								additionalData: {
									...extra,
									[OAUTH_APP_STATE_KEY]: appRole,
								},
							},
						},
					};
				}
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
		databaseHooks: {
			user: {
				create: {
					before: async (user, ctx) => {
						const appRole = await resolveRequestAppForContext(ctx);
						return { data: { ...user, role: appRole } };
					},
				},
			},
			session: {
				create: {
					before: async (session, ctx) => {
						const requiredApp = await resolveRequestAppForContext(ctx);
						const userRole = await getUserRole(session.userId);
						if (userRole !== requiredApp) {
							throw new APIError("FORBIDDEN", {
								message:
									userRole === "student"
										? ROLE_MISMATCH_STUDENT_ON_TEACHER_MESSAGE
										: ROLE_MISMATCH_TEACHER_ON_PORTAL_MESSAGE,
								code: "ROLE_MISMATCH",
							});
						}
					},
				},
			},
		},
		advanced: {
			...(input.runInBackground && {
				backgroundTasks: { handler: input.runInBackground },
			}),
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
