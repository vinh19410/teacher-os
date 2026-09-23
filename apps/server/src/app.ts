import { membership } from "@teacher-os/db/schema/membership";
import { organization } from "@teacher-os/db/schema/organization";
import { asc, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { kernelRoutes } from "./routes/kernel";
import { readinessRoute } from "./routes/readiness";
import { studentRoutes } from "./routes/student";
import type { SessionUser } from "./session";

export type Db = DrizzleD1Database<Record<string, never>>;

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
			pathname.startsWith("/api/student/")
		) {
			return next();
		}
		const session = await deps.getSessionUser(c.req.raw.headers);
		if (!session) {
			return next(); // unauthenticated: kernel routes answer 401
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

	app.use(logger());
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
			allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	);
	app.use("/api/*", bootstrapMiddleware(deps));
	app.on(["POST", "GET"], "/api/auth/*", (c) => deps.authHandler(c.req.raw));
	app.get("/", (c) => c.text("OK"));
	// Readiness probe: mounted outside /api/* so the bootstrap middleware and
	// Better Auth never run — it answers purely from the D1 schema catalog.
	app.get("/readyz", readinessRoute(deps));
	app.route("/api/student", studentRoutes(deps));
	app.route("/api", kernelRoutes(deps));

	return app;
}
