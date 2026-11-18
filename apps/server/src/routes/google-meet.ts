import {
	GOOGLE_MEET_ERROR_CODES,
	sessionRecordingUpdateSchema,
} from "@teacher-os/api/contracts";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import { classTable } from "@teacher-os/db/schema/class";
import { and, eq } from "drizzle-orm";
import { type Context, Hono, type Next } from "hono";
import type { AppDeps, KernelCtx } from "../app";
import {
	GoogleIntegrationError,
	getGoogleIntegrationStatus,
} from "../lib/google-meet/google-oauth";
import {
	bulkCreateMeetingsForClass,
	ensureSessionMeeting,
	type GoogleMeetServiceDeps,
	syncRecordingForOccurrence,
	updateSessionRecordingManual,
} from "../lib/google-meet/session-meet-service";

export type GoogleMeetRouteDeps = Pick<
	AppDeps,
	| "getDb"
	| "runInBackground"
	| "googleClientId"
	| "googleClientSecret"
	| "googleFetch"
	| "getGoogleWorkspaceClient"
>;

export function googleMeetDepsFrom(
	deps: GoogleMeetRouteDeps,
): GoogleMeetServiceDeps {
	return {
		db: deps.getDb(),
		googleClientId: deps.googleClientId,
		googleClientSecret: deps.googleClientSecret,
		fetchFn: deps.googleFetch,
		getGoogleWorkspaceClient: deps.getGoogleWorkspaceClient,
		clientCache: new Map(),
	};
}

export function isGoogleMeetEnabled(deps: GoogleMeetRouteDeps): boolean {
	return Boolean(
		deps.getGoogleWorkspaceClient ||
			(deps.googleClientId && deps.googleClientSecret),
	);
}

export async function runGoogleSyncTask(
	deps: GoogleMeetRouteDeps,
	task: () => Promise<void>,
): Promise<void> {
	if (!isGoogleMeetEnabled(deps)) return;
	const wrapped = task().catch((err) => {
		console.warn("[google-meet] background sync error", err);
	});
	if (deps.runInBackground) {
		deps.runInBackground(wrapped);
	} else {
		await wrapped;
	}
}

export function googleMeetRoutes(deps: AppDeps) {
	const router = new Hono<{ Variables: { kernelCtx: KernelCtx } }>();
	const allowedOrigins = Array.isArray(deps.corsOrigin)
		? deps.corsOrigin
		: typeof deps.corsOrigin === "string"
			? [deps.corsOrigin]
			: [];

	async function requireWriteCsrf(c: Context, next: Next) {
		const origin = c.req.header("Origin") ?? "";
		if (!allowedOrigins.includes(origin)) {
			return c.json({ error: "origin not allowed" }, 403);
		}
		const contentType = c.req.header("Content-Type") ?? "";
		if (!contentType.toLowerCase().startsWith("application/json")) {
			return c.json({ error: "content-type must be application/json" }, 415);
		}
		return next();
	}

	router.get("/integrations/google/status", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const status = await getGoogleIntegrationStatus(deps.getDb(), ctx.userId);
		return c.json(status);
	});

	router.post(
		"/classes/:classId/sessions/:date/meet",
		requireWriteCsrf,
		async (c) => {
			const ctx = c.get("kernelCtx");
			if (!ctx) return c.json({ error: "unauthorized" }, 401);
			const classId = c.req.param("classId") ?? "";
			const dateISO = parseStartDateStrict(c.req.param("date") ?? "");
			if (!dateISO) {
				return c.json({ error: "invalid date", reason: "invalid-date" }, 400);
			}
			const db = deps.getDb();
			const [cls] = await db
				.select({ id: classTable.id })
				.from(classTable)
				.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)))
				.limit(1);
			if (!cls) {
				return c.json({ error: "class not found" }, 404);
			}

			try {
				const res = await ensureSessionMeeting(googleMeetDepsFrom(deps), {
					orgId: ctx.orgId,
					classId,
					dateISO,
					actorUserId: ctx.userId,
				});
				return c.json(res);
			} catch (err) {
				if (err instanceof GoogleIntegrationError) {
					return c.json(
						{ error: err.message, code: err.code },
						err.status as 400 | 404 | 409 | 412 | 502 | 503,
					);
				}
				return c.json(
					{
						error: "Không tạo được Google Meet.",
						code: GOOGLE_MEET_ERROR_CODES.API_ERROR,
					},
					502,
				);
			}
		},
	);

	router.post("/classes/:classId/meet/bulk", requireWriteCsrf, async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const classId = c.req.param("classId") ?? "";
		const db = deps.getDb();
		const [cls] = await db
			.select({ id: classTable.id })
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)))
			.limit(1);
		if (!cls) {
			return c.json({ error: "class not found" }, 404);
		}

		try {
			const res = await bulkCreateMeetingsForClass(googleMeetDepsFrom(deps), {
				orgId: ctx.orgId,
				classId,
				actorUserId: ctx.userId,
			});
			return c.json(res);
		} catch (err) {
			if (err instanceof GoogleIntegrationError) {
				return c.json(
					{ error: err.message, code: err.code },
					err.status as 400 | 404 | 409 | 412 | 502 | 503,
				);
			}
			return c.json(
				{
					error: "Không tạo được Google Meet cho lớp.",
					code: GOOGLE_MEET_ERROR_CODES.API_ERROR,
				},
				502,
			);
		}
	});

	router.post(
		"/classes/:classId/sessions/:date/recording/sync",
		requireWriteCsrf,
		async (c) => {
			const ctx = c.get("kernelCtx");
			if (!ctx) return c.json({ error: "unauthorized" }, 401);
			const classId = c.req.param("classId") ?? "";
			const dateISO = parseStartDateStrict(c.req.param("date") ?? "");
			if (!dateISO) {
				return c.json({ error: "invalid date", reason: "invalid-date" }, 400);
			}
			const db = deps.getDb();
			const [cls] = await db
				.select({ id: classTable.id })
				.from(classTable)
				.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)))
				.limit(1);
			if (!cls) {
				return c.json({ error: "class not found" }, 404);
			}

			try {
				const res = await syncRecordingForOccurrence(googleMeetDepsFrom(deps), {
					orgId: ctx.orgId,
					classId,
					dateISO,
					actorUserId: ctx.userId,
				});
				return c.json(res);
			} catch (err) {
				if (err instanceof GoogleIntegrationError) {
					return c.json(
						{ error: err.message, code: err.code },
						err.status as 400 | 404 | 409 | 412 | 502 | 503,
					);
				}
				return c.json(
					{
						error: "Không đồng bộ được recording từ Google Meet.",
						code: GOOGLE_MEET_ERROR_CODES.API_ERROR,
					},
					502,
				);
			}
		},
	);

	router.put(
		"/classes/:classId/sessions/:date/recording",
		requireWriteCsrf,
		async (c) => {
			const ctx = c.get("kernelCtx");
			if (!ctx) return c.json({ error: "unauthorized" }, 401);
			const classId = c.req.param("classId") ?? "";
			const dateISO = parseStartDateStrict(c.req.param("date") ?? "");
			if (!dateISO) {
				return c.json({ error: "invalid date", reason: "invalid-date" }, 400);
			}
			const db = deps.getDb();
			const [cls] = await db
				.select({ id: classTable.id })
				.from(classTable)
				.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)))
				.limit(1);
			if (!cls) {
				return c.json({ error: "class not found" }, 404);
			}

			const raw = await c.req.json().catch(() => null);
			const parsed = sessionRecordingUpdateSchema.safeParse(raw);
			if (!parsed.success) {
				return c.json(
					{
						error:
							parsed.error.issues[0]?.message ?? "Link recording không hợp lệ.",
					},
					400,
				);
			}

			const updated = await updateSessionRecordingManual(db, {
				orgId: ctx.orgId,
				classId,
				dateISO,
				recordingUrl: parsed.data.recordingUrl,
			});
			return c.json({
				status: updated.status,
				recordingUrl: updated.recordingUrl,
				syncedAt: new Date().toISOString(),
				message: null,
			});
		},
	);

	return router;
}
