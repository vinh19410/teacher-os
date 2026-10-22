import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import { membership } from "@teacher-os/db/schema/membership";
import { organization } from "@teacher-os/db/schema/organization";
import { asc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import type { BankHubContext } from "./lib/bank-hub/bank-hub-client";
import type { MediaStore } from "./lib/media-store";
import { redactResetToken } from "./log-redaction";
import { adminLibraryRoutes } from "./routes/admin-library";
import { bankHubMockRoutes } from "./routes/bank-hub-mock";
import { bankHubWebhookRoutes } from "./routes/bank-hub-webhooks";
import { kernelRoutes } from "./routes/kernel";
import { publicPayRoutes } from "./routes/public-pay";
import { readinessRoute } from "./routes/readiness";
import { studentRoutes } from "./routes/student";
import { studentClassmatesRoutes } from "./routes/student-classmates";
import { studentHistoryRoutes } from "./routes/student-history";
import { studentPracticeRoutes } from "./routes/student-practice";
import type { SessionUser } from "./session";

export type Db = DrizzleD1Database<Record<string, never>>;
// Re-export cho e2e fake (pattern tương tự MediaStore ở dưới).
export type {
	BankHubAccount,
	BankHubClient,
	BankHubContext,
	BankHubLinkPurpose,
	BankHubTransaction,
} from "./lib/bank-hub/bank-hub-client";
// Re-export cho adapter lưu trữ của e2e (package `server` chỉ export
// `.`, `./app`, `./session`).
export {
	enforceDeclaredSize,
	MediaSizeMismatchError,
	type MediaStore,
	type StoredMedia,
} from "./lib/media-store";

export interface KernelCtx {
	orgId: string;
	userId: string;
}

export type ServerApp = Hono<{ Variables: { kernelCtx: KernelCtx } }>;

/**
 * Every collaborator that touches Cloudflare bindings is injected so the
 * middleware + route chain can run under plain node in tests.
 */
export interface AppDeps {
	getDb(): Db;
	corsOrigin: string | string[];
	getSessionUser(headers: Headers): Promise<SessionUser | null>;
	authHandler(req: Request): Response | Promise<Response>;
	/**
	 * Kho file bài nói Speaking (#305) — R2 ở production, đĩa ở e2e. Optional:
	 * test hiện có không cần storage; vắng mặt (hoặc binding thiếu → trả
	 * undefined) thì các route media trả 503.
	 */
	getMediaStore?(): MediaStore | undefined;
	/**
	 * Kho audio thư viện đề (#413 phase 3) — R2 ở production, đĩa ở e2e.
	 * Vắng mặt → các route audio của /api/admin/library trả 503
	 * LIBRARY_AUDIO_DISABLED, cùng hợp đồng với `getMediaStore`.
	 */
	getLibraryAudioStore?(): MediaStore | undefined;
	/**
	 * Plan #413: allowlist email admin (binding ADMIN_EMAILS đã parse; so
	 * khớp lowercase trong requireAdmin). Rỗng = không ai là admin.
	 */
	adminEmails?: string[];
	/**
	 * Plan #413: origin của console admin dùng cho CSRF /api/admin — cố ý
	 * tách khỏi `corsOrigin` (gồm cả origin teacher/student). Rỗng → mọi
	 * write /api/admin bị 403 (fail-closed).
	 */
	adminOrigins?: string | string[];
	/**
	 * SePay Bank Hub (#320) — vắng mặt (thiếu secret) thì các route ngân hàng
	 * trả 503 BANKHUB_DISABLED, y hệt hợp đồng của `getMediaStore`.
	 */
	getBankHub?(): BankHubContext | undefined;
	/**
	 * Chạy việc dọn dẹp sau response (xoá object R2 bù trừ) — production
	 * truyền `waitUntil` để việc không bị huỷ khi client ngắt kết nối.
	 */
	runInBackground?(promise: Promise<unknown>): void;
}

/** Better-Auth handles its own session bootstrapping under /api/auth. */
function isAuthPath(pathname: string): boolean {
	return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

/**
 * First request of a fresh teacher gets an empty org plus a `teacher`
 * membership — idempotent, unique per (orgId, userId), earliest org wins
 * if a concurrent bootstrap race creates two.
 */
function bootstrapMiddleware(deps: AppDeps) {
	return async (
		c: Context<{ Variables: { kernelCtx: KernelCtx } }>,
		next: () => Promise<void>,
	) => {
		const pathname = c.req.path;
		if (
			isAuthPath(pathname) ||
			pathname === "/api/student" ||
			pathname.startsWith("/api/student/") ||
			pathname === "/api/admin" ||
			pathname.startsWith("/api/admin/")
		) {
			return next();
		}
		const session = await deps.getSessionUser(c.req.raw.headers);
		if (!session) {
			return next(); // unauthenticated: kernel routes answer 401
		}
		// Account-role gate (plan #260): the shared cross-subdomain cookie zone
		// gives a portal session full API reach here, so a student role must
		// never bootstrap an org/membership on the teacher app.
		if (session.role === "student") {
			return c.json(
				{
					error: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP,
					code: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP,
				},
				403,
			);
		}
		// Plan #413: role admin không bao giờ bootstrap org/membership trên
		// kernel tree — admin chỉ làm việc trên /api/admin (bypass ở trên).
		if (session.role === "admin") {
			return c.json(
				{
					error: ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP,
					code: ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP,
				},
				403,
			);
		}
		const db = deps.getDb();
		const readMemberships = () =>
			db
				.select()
				.from(membership)
				.where(eq(membership.userId, session.userId))
				.orderBy(asc(membership.createdAt), asc(membership.id));
		let rows = await readMemberships();
		if (rows.length === 0) {
			const orgId = crypto.randomUUID();
			await db.batch([
				db.insert(organization).values({ id: orgId, name: session.userName }),
				db.insert(membership).values({
					id: crypto.randomUUID(),
					orgId,
					userId: session.userId,
					role: "teacher",
				}),
			]);
			// Re-read: a racing request may have created an earlier org — first wins.
			rows = await readMemberships();
		}
		const first = rows[0];
		if (!first) {
			return c.json({ error: "no membership after bootstrap" }, 403);
		}
		c.set("kernelCtx", { orgId: first.orgId, userId: session.userId });
		return next();
	};
}

export function buildApp(deps: AppDeps) {
	const app = new Hono<{ Variables: { kernelCtx: KernelCtx } }>();

	app.use(
		logger((line, ...rest) => console.log(redactResetToken(line), ...rest)),
	);
	// File bài nói học viên (#305): CORP same-site thay cho `cross-origin`
	// global — cookie SameSite=None nên trang ngoài nhúng được `<video src>`
	// tới API. Đăng ký TRƯỚC secureHeaders: secureHeaders ghi header sau
	// next(), middleware ngoài cùng hơn mới ghi được giá trị cuối.
	app.use("/api/student/attempts/:attemptId/media", async (c, next) => {
		await next();
		c.res.headers.set("Cross-Origin-Resource-Policy", "same-site");
	});
	// Media giáo viên (chấm bài) — cùng lý do override CORP như route học viên ở trên.
	app.use("/api/grading/:attemptId/media", async (c, next) => {
		await next();
		c.res.headers.set("Cross-Origin-Resource-Policy", "same-site");
	});
	app.use(
		"/*",
		secureHeaders({
			strictTransportSecurity: "max-age=31536000; includeSubDomains",
			xFrameOptions: "DENY",
			xContentTypeOptions: "nosniff",
			referrerPolicy: "strict-origin-when-cross-origin",
			crossOriginResourcePolicy: "cross-origin",
			crossOriginOpenerPolicy: false,
		}),
	);
	app.use("/*", async (c, next) => {
		const url = new URL(c.req.url);
		const isLocal =
			url.hostname === "localhost" ||
			url.hostname === "127.0.0.1" ||
			url.hostname === "0.0.0.0" ||
			url.hostname === "[::1]" ||
			url.hostname === "::1" ||
			url.hostname.endsWith(".localhost") ||
			url.hostname.endsWith(".local");
		if (isLocal || url.protocol === "https:") {
			return next();
		}
		const forwarded = c.req.header("x-forwarded-proto");
		const firstProto = forwarded?.split(",")[0]?.trim().toLowerCase();
		if (firstProto === "https") {
			return next();
		}
		url.protocol = "https:";
		return c.redirect(url.toString(), 301);
	});
	app.use(
		"/*",
		cors({
			origin: deps.corsOrigin,
			// PATCH: full-test builder phase-2 (PATCH /assignments/prompts/:id,
			// /assignments/tests/:id) — coordinator-approved 2026-09-28.
			allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			// X-File-Name: tên file bài nói Speaking (#305), upload là raw body
			// nên tên đi qua header (encodeURIComponent).
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"x-student-org-id",
				"X-File-Name",
			],
			credentials: true,
		}),
	);
	app.use("/api/*", bootstrapMiddleware(deps));
	app.on(["POST", "GET"], "/api/auth/*", (c) => deps.authHandler(c.req.raw));
	app.get("/", (c) => c.text("OK"));
	// Bank Hub webhooks (#320): mounted outside /api/* so the bootstrap
	// middleware and Better Auth never run — auth is the X-Secret-Key header.
	app.route("/webhooks/sepay/bankhub", bankHubWebhookRoutes(deps));
	// Postman-facing sandbox mock-transaction wrapper: same outside-/api
	// treatment, auth is the IPN Apikey header (see routes/bank-hub-mock.ts).
	app.route("/dev/bank-hub", bankHubMockRoutes(deps));
	// Public pay page data (#320): outside /api/* (bootstrap 403s student
	// roles there) and readable signed-out — the token is the capability.
	app.route("/public/pay", publicPayRoutes(deps));
	// Readiness probe: mounted outside /api/* so the bootstrap middleware and
	// Better Auth never run — it answers purely from the D1 schema catalog.
	app.get("/readyz", readinessRoute(deps));
	app.route("/api/student", studentRoutes(deps));
	// Bạn cùng lớp (#378): sub-app cùng mount point, route riêng
	// /classes/:classId/classmates — guard tạo từ chung createStudentGuard.
	app.route("/api/student", studentClassmatesRoutes(deps));
	// Tự luyện (#378 phase 10): sub-app cùng mount point — catalog + take +
	// start attempt practice; guard tự gắn trong router (bootstrapMiddleware
	// bỏ qua /api/student).
	app.route("/api/student", studentPracticeRoutes(deps));
	// Lịch sử học tập (#378 phase 11): month/week/list — cùng mount point,
	// guard tự gắn trong router như practice.
	app.route("/api/student", studentHistoryRoutes(deps));
	// Plan #413 phase 3: router thật của thư viện đề — requireAdmin +
	// CSRF Origin(adminOrigins) tự gắn trong router; bootstrapMiddleware vẫn
	// bypass /api/admin nên không session teacher nào bootstrap org qua
	// đường này. Mount tại /api/admin/library; các nhánh admin khác (phase
	// sau) mount song song cùng guard.
	app.route(
		"/api/admin/library",
		adminLibraryRoutes({
			getDb: deps.getDb,
			getSessionUser: deps.getSessionUser,
			adminEmails: deps.adminEmails ?? [],
			adminOrigins: deps.adminOrigins ?? [],
			getLibraryAudioStore: deps.getLibraryAudioStore,
			runInBackground: deps.runInBackground,
		}),
	);
	app.route("/api", kernelRoutes(deps));

	return app;
}
