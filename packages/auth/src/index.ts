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
	/**
	 * Origins of the admin console (plan #413). Sign-ups here are rejected
	 * unless the email is in `adminEmails`; origin khớp CHÍNH XÁC mới tính.
	 */
	adminOrigins?: string[];
	/**
	 * Allowlist email admin (phân tách dấu phẩy ở binding ADMIN_EMAILS, đã
	 * parse; so khớp lowercase). Rỗng = không ai đăng ký được role admin.
	 */
	adminEmails?: string[];
	/**
	 * Allowlist email giáo viên (binding TEACHER_EMAILS). Rỗng = không giới hạn.
	 */
	teacherEmails?: string[];
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
/** Tài khoản quản trị chỉ dùng cổng admin; role khác không vào cổng admin (plan #413). */
const ROLE_MISMATCH_ADMIN_MESSAGE =
	"Tài khoản này không được phép đăng nhập vào cổng quản trị.";

export function createAuth(input: CreateAuthInput) {
	const cookieDomain = crossSubDomainCookieDomain(input.cookieDomain);
	const cookiePrefix = authCookiePrefix(input.cookiePrefix);
	const trustedOrigins = Array.isArray(input.corsOrigin)
		? input.corsOrigin
		: [input.corsOrigin];
	const teacherOrigins = trustedOrigins.filter(
		(o) =>
			!input.studentOrigins.includes(o) &&
			!(input.adminOrigins ?? []).includes(o),
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

	/**
	 * Origin của callbackURL trên link xác thực email (#299): bấm link trong mail
	 * là GET navigation không có Origin header. callbackURL đã qua originCheck
	 * của better-auth, và resolveRequestApp chỉ tin origin khớp chính xác.
	 */
	function verifyEmailCallbackOrigin(
		ctx: { path?: string; query?: Record<string, unknown> } | null | undefined,
	): string | null {
		if (ctx?.path !== "/verify-email") return null;
		const callbackURL = ctx.query?.callbackURL;
		if (typeof callbackURL !== "string") return null;
		try {
			return new URL(callbackURL).origin;
		} catch {
			return null;
		}
	}

	/** App nguồn của request hiện tại: Origin trước, rồi callbackURL của link
	 * xác thực email, OAuth state làm fallback. */
	async function resolveRequestAppForContext(
		ctx:
			| {
					request?: Request | null;
					path?: string;
					query?: Record<string, unknown>;
			  }
			| null
			| undefined,
	): Promise<string> {
		const oauthApp = await readOAuthApp();
		return resolveRequestApp({
			origin:
				ctx?.request?.headers?.get("origin") ?? verifyEmailCallbackOrigin(ctx),
			oauthApp,
			studentOrigins: input.studentOrigins,
			teacherOrigins,
			adminOrigins: input.adminOrigins ?? [],
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
				// Luôn hiện màn chọn tài khoản Google: sau khi bị chặn role
				// mismatch, người dùng phải chọn được Gmail khác thay vì bị
				// Google tự dùng lại phiên đang đăng nhập.
				prompt: "select_account",
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
								adminOrigins: input.adminOrigins ?? [],
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
						adminOrigins: input.adminOrigins ?? [],
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
						// Plan #413: origin admin không được tự cấp quyền admin cho
						// người lạ — chỉ email trong ADMIN_EMAILS được tạo user role
						// admin (áp cho cả email/password lẫn Google callback).
						if (appRole === "admin") {
							const email = user.email?.trim().toLowerCase() ?? "";
							const allow = (input.adminEmails ?? []).some(
								(e) => e.trim().toLowerCase() === email,
							);
							if (!email || !allow) {
								throw new APIError("FORBIDDEN", {
									message:
										"Email này không được cấp quyền quản trị. Vui lòng dùng cổng học viên hoặc liên hệ quản trị viên.",
									code: "ADMIN_SIGNUP_FORBIDDEN",
								});
							}
						}
						// Single-org (#513, #524): khi TEACHER_EMAILS khác rỗng, chỉ email
						// trong allowlist mới đăng ký được tài khoản giáo viên; đồng thời
						// không cho phép đăng ký email trong TEACHER_EMAILS từ cổng khác
						// (student/admin) để tránh làm nhiễm role='student' gây khóa tài khoản.
						if ((input.teacherEmails ?? []).length > 0) {
							const email = user.email?.trim().toLowerCase() ?? "";
							const allow = (input.teacherEmails ?? []).some(
								(e) => e.trim().toLowerCase() === email,
							);
							if (appRole === "teacher" && (!email || !allow)) {
								throw new APIError("FORBIDDEN", {
									message:
										"Ứng dụng giáo viên hiện chỉ dành cho chủ tài khoản. Học viên vui lòng dùng cổng học viên.",
									code: "TEACHER_SIGNUP_FORBIDDEN",
								});
							}
							if (appRole !== "teacher" && email && allow) {
								throw new APIError("FORBIDDEN", {
									message:
										"Email này thuộc tài khoản giáo viên. Vui lòng đăng nhập tại ứng dụng giáo viên.",
									code: "TEACHER_SIGNUP_FORBIDDEN",
								});
							}
						}
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
							// Plan #413: role admin chỉ được vào cổng admin; role khác
							// không bao giờ vào cổng admin dù Origin có khớp.
							const message =
								userRole === "admin"
									? ROLE_MISMATCH_ADMIN_MESSAGE
									: requiredApp === "admin"
										? ROLE_MISMATCH_ADMIN_MESSAGE
										: userRole === "student"
											? ROLE_MISMATCH_STUDENT_ON_TEACHER_MESSAGE
											: ROLE_MISMATCH_TEACHER_ON_PORTAL_MESSAGE;
							const error = new APIError("FORBIDDEN", {
								message,
								code: "ROLE_MISMATCH",
							});
							// Link xác thực email (#299): email đã được xác thực trước bước
							// này; bỏ auto sign-in và đưa người dùng về trang callback kèm
							// ?error= thay vì 403 JSON trần tại URL của API.
							const callbackURL = ctx?.query?.callbackURL;
							if (
								ctx?.path === "/verify-email" &&
								typeof callbackURL === "string"
							) {
								const separator = callbackURL.includes("?") ? "&" : "?";
								throw ctx.redirect(
									`${callbackURL}${separator}error=ROLE_MISMATCH`,
								);
							}
							throw error;
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
