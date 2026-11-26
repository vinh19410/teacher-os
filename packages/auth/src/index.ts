import * as schema from "@teacher-os/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api";
import { eq } from "drizzle-orm";
import {
	validateUpdateUserImage,
	validateUpdateUserName,
} from "./avatar-policy";
import { BRAND_NAME } from "./mail/brand";
import type { Mailer } from "./mail/mailer";
import { resetPasswordEmailTemplate } from "./mail/reset-password-email-template";
import { verificationEmailTemplate } from "./mail/verification-email-template";
import {
	OAUTH_APP_STATE_KEY,
	resolveAllowlistRole,
	resolveRequestApp,
	resolveUserRole,
} from "./role";
import { provisionStudentForUser } from "./student-provisioning";
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
	 * Origins phục vụ cổng LMS hợp nhất (một origin chung cho teacher, student,
	 * admin với auto-redirect theo role). Đăng ký công khai qua email/mật khẩu
	 * chỉ tạo tài khoản `student` (chặn `adminEmails`/`teacherEmails` trả 403
	 * `ROLE_SIGNUP_FORBIDDEN` để đóng account squatting & pre-hijacking); khởi
	 * tạo tài khoản `admin`/`teacher` lần đầu đi qua Google OAuth (gán role theo
	 * `adminEmails` > `teacherEmails` > `"student"`). Đăng nhập / xác thực email
	 * / đặt lại mật khẩu cho phép mọi role hợp lệ.
	 */
	unifiedOrigins?: string[];
	/**
	 * Origins of the student portal app; teacher origins are derived as
	 * corsOrigin minus studentOrigins. Sign-ups from an unknown origin default
	 * to the student role (least privilege, plan #260 D3).
	 */
	studentOrigins?: string[];
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
	/**
	 * Điều khiển tường minh Better-Auth in-memory rate limiter (Workers bật
	 * `enabled: true` vì `NODE_ENV` không được gán trong bindings; local/E2E
	 * bỏ trống theo mặc định Better-Auth).
	 */
	rateLimit?: {
		enabled?: boolean;
	};
	/**
	 * Danh sách header IP đáng tin cậy để tách bucket rate-limit theo client IP
	 * (trên Cloudflare Worker chỉ truyền `["cf-connecting-ip"]`, không tin ở
	 * runtime Node/E2E để tránh giả mạo header).
	 */
	trustedIpHeaders?: string[];
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
/**
 * Chặn tự đăng ký bằng email/mật khẩu cho email đặc quyền (ADMIN_EMAILS /
 * TEACHER_EMAILS) trên unified LMS để đóng cửa sổ account squatting &
 * verification-link pre-hijacking. Dùng chung một mã/thông báo cho cả hai role
 * và chặn sớm ở hooks.before (đóng claimed-vs-unclaimed oracle và admin-vs-teacher
 * oracle; chấp nhận trade-off allowlist-oracle để hướng dẫn chủ tài khoản đăng
 * nhập bằng Google).
 */
const UNIFIED_PRIVILEGED_SIGNUP_FORBIDDEN_MESSAGE =
	'Email này không thể tự đăng ký bằng mật khẩu. Nếu đây là tài khoản của bạn, vui lòng chọn "Tiếp tục với Google" để đăng nhập.';

export function createAuth(input: CreateAuthInput) {
	const cookieDomain = crossSubDomainCookieDomain(input.cookieDomain);
	const cookiePrefix = authCookiePrefix(input.cookiePrefix);
	const trustedOrigins = Array.isArray(input.corsOrigin)
		? input.corsOrigin
		: [input.corsOrigin];
	const studentOrigins = input.studentOrigins ?? [];
	const adminOrigins = input.adminOrigins ?? [];
	const unifiedOrigins = input.unifiedOrigins ?? [];
	const teacherOrigins = trustedOrigins.filter(
		(o) => !studentOrigins.includes(o) && !adminOrigins.includes(o),
	);

	function matchesOriginList(
		origin: string | null | undefined,
		list: string[],
	): boolean {
		const normalized = (origin ?? "").trim().toLowerCase();
		return (
			normalized.length > 0 &&
			normalized !== "null" &&
			list.some((o) => o.trim().toLowerCase() === normalized)
		);
	}

	function isUnifiedOrigin(origin: string | null | undefined): boolean {
		return matchesOriginList(origin, unifiedOrigins);
	}

	// Đọc live input.adminEmails / input.teacherEmails trên từng request (không
	// copy/snapshot thành Set lúc khởi tạo) để E2E /__e2e/teacher-emails mutate
	// mảng tại chỗ có hiệu lực tức thời.
	function isEmailInList(
		email: string | null | undefined,
		list: string[] | undefined,
	): boolean {
		const normalized = (email ?? "").trim().toLowerCase();
		return (
			normalized.length > 0 &&
			(list ?? []).some((entry) => entry.trim().toLowerCase() === normalized)
		);
	}

	function isPrivilegedAllowlistEmail(
		email: string | null | undefined,
	): boolean {
		return (
			isEmailInList(email, input.adminEmails) ||
			isEmailInList(email, input.teacherEmails)
		);
	}

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

	async function isUnifiedContext(
		ctx:
			| {
					request?: Request | null;
					path?: string;
					query?: Record<string, unknown>;
			  }
			| null
			| undefined,
	): Promise<boolean> {
		if (unifiedOrigins.length === 0) return false;
		if (isUnifiedOrigin(ctx?.request?.headers?.get("origin"))) return true;
		if (isUnifiedOrigin(verifyEmailCallbackOrigin(ctx))) return true;
		return (await readOAuthApp()) === "unified";
	}

	function normalizeUserProfile(user: {
		name?: string | null;
		email?: string | null;
		image?: string | null;
	}) {
		let userName = user.name?.trim() ?? "";
		if (!userName && user.email) {
			userName = user.email.split("@")[0] || "Học viên";
		}
		let userImage = user.image;
		if (userImage && validateUpdateUserImage(userImage)) {
			userImage = undefined;
		}
		return { userName, userImage };
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
			studentOrigins,
			teacherOrigins,
			adminOrigins,
		});
	}

	async function maybeProvisionVerifiedStudent(
		candidate: unknown,
	): Promise<void> {
		if (!candidate || typeof candidate !== "object") return;
		const candidateUser = candidate as {
			role?: unknown;
			emailVerified?: unknown;
			email?: unknown;
			name?: unknown;
		};
		if (
			candidateUser.role !== "student" ||
			candidateUser.emailVerified !== true
		) {
			return;
		}
		if (
			typeof candidateUser.email !== "string" ||
			!candidateUser.email.trim()
		) {
			return;
		}
		await provisionStudentForUser(
			input.db as object,
			{
				name: typeof candidateUser.name === "string" ? candidateUser.name : "",
				email: candidateUser.email,
			},
			{ teacherEmails: input.teacherEmails },
		);
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
				let callbackOrigin: string | null = null;
				if (callbackURL) {
					try {
						callbackOrigin = new URL(callbackURL).origin;
					} catch {
						callbackOrigin = null;
					}
				}
				if (!isUnifiedOrigin(callbackOrigin)) {
					if (!matchesOriginList(callbackOrigin, trustedOrigins)) return;
					const targetApp = resolveRequestApp({
						origin: callbackOrigin,
						studentOrigins,
						teacherOrigins,
						adminOrigins,
					});
					// Chặn gửi link sang cổng khác role của tài khoản; response vẫn trung tính.
					if (targetApp !== resolveUserRole(await getUserRole(user.id))) return;
				}

				const { html, text } = resetPasswordEmailTemplate({ url });
				try {
					await input.mailer.send({
						to: user.email,
						fromName: BRAND_NAME,
						subject: `Đặt lại mật khẩu ${BRAND_NAME} của bạn`,
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
						fromName: BRAND_NAME,
						subject: `Xác thực email ${BRAND_NAME} của bạn`,
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
			afterEmailVerification: async (verifiedUser) => {
				await maybeProvisionVerifiedStudent(verifiedUser);
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
					const origin = ctx.headers?.get("origin") ?? null;
					const appState = isUnifiedOrigin(origin)
						? "unified"
						: resolveRequestApp({
								origin,
								studentOrigins,
								teacherOrigins,
								adminOrigins,
							});
					return {
						context: {
							body: {
								...body,
								additionalData: {
									...extra,
									[OAUTH_APP_STATE_KEY]: appState,
								},
							},
						},
					};
				}
				if (ctx.path === "/sign-up/email" && unifiedOrigins.length > 0) {
					const body = (ctx.body ?? {}) as Record<string, unknown>;
					if (
						typeof body.email === "string" &&
						isPrivilegedAllowlistEmail(body.email)
					) {
						throw new APIError("FORBIDDEN", {
							message: UNIFIED_PRIVILEGED_SIGNUP_FORBIDDEN_MESSAGE,
							code: "ROLE_SIGNUP_FORBIDDEN",
						});
					}
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
						if (unifiedOrigins.length > 0) {
							const oauthApp = await readOAuthApp();
							const isUnifiedOAuthCallback =
								ctx?.path === "/callback/:id" && oauthApp === "unified";
							if (
								isPrivilegedAllowlistEmail(user.email) &&
								!isUnifiedOAuthCallback
							) {
								throw new APIError("FORBIDDEN", {
									message: UNIFIED_PRIVILEGED_SIGNUP_FORBIDDEN_MESSAGE,
									code: "ROLE_SIGNUP_FORBIDDEN",
								});
							}
						}
						if (await isUnifiedContext(ctx)) {
							const role = resolveAllowlistRole(user.email, {
								adminEmails: input.adminEmails,
								teacherEmails: input.teacherEmails,
							});
							const { userName, userImage } = normalizeUserProfile(user);
							return {
								data: {
									...user,
									name: userName,
									image: userImage,
									role,
								},
							};
						}
						const appRole = await resolveRequestAppForContext(ctx);
						// Plan #413: origin admin không được tự cấp quyền admin cho
						// người lạ — chỉ email trong ADMIN_EMAILS được tạo user role
						// admin (áp cho cả email/password lẫn Google callback).
						if (appRole === "admin") {
							if (!isEmailInList(user.email, input.adminEmails)) {
								throw new APIError("FORBIDDEN", {
									message:
										"Email này không được cấp quyền quản trị. Vui lòng dùng cổng học viên hoặc liên hệ quản trị viên.",
									code: "ADMIN_SIGNUP_FORBIDDEN",
								});
							}
						}
						// Chặn role-poisoning thành student cho email thuộc ADMIN_EMAILS
						// trên cổng học viên hoặc request thiếu/"null" Origin.
						if (
							appRole === "student" &&
							isEmailInList(user.email, input.adminEmails)
						) {
							throw new APIError("FORBIDDEN", {
								message:
									"Email này thuộc tài khoản quản trị. Vui lòng đăng nhập tại cổng quản trị.",
								code: "ADMIN_SIGNUP_FORBIDDEN",
							});
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
						// Normalize empty/whitespace names and strip unsafe avatars on signup/OAuth.
						const { userName, userImage } = normalizeUserProfile(user);
						return {
							data: {
								...user,
								name: userName,
								image: userImage,
								role: appRole,
							},
						};
					},
					after: async (created) => {
						await maybeProvisionVerifiedStudent(created);
					},
				},
				update: {
					after: async (updated) => {
						await maybeProvisionVerifiedStudent(updated);
					},
				},
			},
			session: {
				create: {
					before: async (session, ctx) => {
						if (await isUnifiedContext(ctx)) {
							return;
						}
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
		rateLimit: {
			...(input.rateLimit?.enabled !== undefined && {
				enabled: input.rateLimit.enabled,
			}),
			// Giữ nguyên các ngưỡng chặt mặc định cho /sign-in/* và /sign-up/* (3/10s),
			// đồng thời cho phép /get-session đủ headroom cho nhiều học viên sau NAT
			// mà vẫn chặn flood D1 từ một IP đơn lẻ.
			customRules: {
				"/get-session": {
					window: 10,
					max: 120,
				},
			},
		},
		advanced: {
			...(input.runInBackground && {
				backgroundTasks: { handler: input.runInBackground },
			}),
			...(input.trustedIpHeaders &&
				input.trustedIpHeaders.length > 0 && {
					ipAddress: {
						ipAddressHeaders: input.trustedIpHeaders,
					},
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
