import {
	RECORDING_ERROR_CODES,
	sessionRecordingUpdateSchema,
	ZOOM_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import { classTable } from "@teacher-os/db/schema/class";
import { classSessionMeeting } from "@teacher-os/db/schema/class-session-meeting";
import { and, eq } from "drizzle-orm";
import { type Context, Hono, type Next } from "hono";
import type { AppDeps, KernelCtx } from "../app";
import { recordingVideoResponse } from "../lib/recording-video-response";
import {
	bulkCreateMeetingsForClass,
	ensureSessionMeeting,
	syncRecordingForOccurrence,
	updateSessionRecordingManual,
	type ZoomServiceDeps,
} from "../lib/zoom/session-zoom-service";
import {
	isZoomConfigured,
	ZoomIntegrationError,
} from "../lib/zoom/zoom-client";

export type ZoomRouteDeps = Pick<
	AppDeps,
	| "getDb"
	| "runInBackground"
	| "zoom"
	| "zoomFetch"
	| "getZoomClient"
	| "getRecordingStore"
	| "now"
>;

export function zoomDepsFrom(deps: ZoomRouteDeps): ZoomServiceDeps {
	return {
		db: deps.getDb(),
		zoom: deps.zoom,
		fetchFn: deps.zoomFetch,
		getZoomClient: deps.getZoomClient,
		recordingStore: deps.getRecordingStore?.(),
		runInBackground: deps.runInBackground,
		now: deps.now,
	};
}

export function isZoomEnabled(deps: ZoomRouteDeps): boolean {
	return Boolean(deps.getZoomClient) || isZoomConfigured(deps.zoom);
}

export async function runZoomSyncTask(
	deps: ZoomRouteDeps,
	task: () => Promise<void>,
): Promise<void> {
	if (!isZoomEnabled(deps)) return;
	const wrapped = task().catch((err) => {
		console.warn("[zoom] background sync error", err);
	});
	if (deps.runInBackground) {
		deps.runInBackground(wrapped);
	} else {
		await wrapped;
	}
}

export function zoomMeetingRoutes(deps: AppDeps) {
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

	router.post(
		"/classes/:classId/sessions/:date/zoom",
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

			if (!isZoomEnabled(deps)) {
				return c.json(
					{
						error: "Chưa cấu hình Zoom cho hệ thống.",
						code: ZOOM_ERROR_CODES.NOT_CONFIGURED,
					},
					503,
				);
			}

			try {
				const res = await ensureSessionMeeting(zoomDepsFrom(deps), {
					orgId: ctx.orgId,
					classId,
					dateISO,
				});
				return c.json(res);
			} catch (err) {
				if (err instanceof ZoomIntegrationError) {
					return c.json(
						{ error: err.message, code: err.code },
						err.status as 400 | 404 | 409 | 502 | 503,
					);
				}
				return c.json(
					{
						error: "Không tạo được Zoom.",
						code: ZOOM_ERROR_CODES.API_ERROR,
					},
					502,
				);
			}
		},
	);

	router.post("/classes/:classId/zoom/bulk", requireWriteCsrf, async (c) => {
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

		if (!isZoomEnabled(deps)) {
			return c.json(
				{
					error: "Chưa cấu hình Zoom cho hệ thống.",
					code: ZOOM_ERROR_CODES.NOT_CONFIGURED,
				},
				503,
			);
		}

		try {
			const res = await bulkCreateMeetingsForClass(zoomDepsFrom(deps), {
				orgId: ctx.orgId,
				classId,
			});
			return c.json(res);
		} catch (err) {
			if (err instanceof ZoomIntegrationError) {
				return c.json(
					{ error: err.message, code: err.code },
					err.status as 400 | 404 | 409 | 502 | 503,
				);
			}
			return c.json(
				{
					error: "Không tạo được Zoom cho lớp.",
					code: ZOOM_ERROR_CODES.API_ERROR,
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

			if (!isZoomEnabled(deps)) {
				return c.json(
					{
						error: "Chưa cấu hình Zoom cho hệ thống.",
						code: ZOOM_ERROR_CODES.NOT_CONFIGURED,
					},
					503,
				);
			}

			try {
				const res = await syncRecordingForOccurrence(zoomDepsFrom(deps), {
					orgId: ctx.orgId,
					classId,
					dateISO,
				});
				return c.json(res);
			} catch (err) {
				if (err instanceof ZoomIntegrationError) {
					return c.json(
						{ error: err.message, code: err.code },
						err.status as 400 | 404 | 409 | 502 | 503,
					);
				}
				return c.json(
					{
						error: "Không đồng bộ được recording từ Zoom.",
						code: ZOOM_ERROR_CODES.API_ERROR,
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

			const updated = await updateSessionRecordingManual(
				db,
				{
					orgId: ctx.orgId,
					classId,
					dateISO,
					recordingUrl: parsed.data.recordingUrl,
				},
				{
					recordingStore: deps.getRecordingStore?.(),
					runInBackground: deps.runInBackground,
					now: deps.now,
				},
			);
			return c.json({
				status: updated.status,
				recordingUrl: updated.recordingUrl,
				recordingSource: updated.recordingUrl ? "external" : null,
				hasRecordingVideo: false,
				recordingExpiresAt: null,
				syncedAt: updated.syncedAt,
				message: null,
			});
		},
	);

	router.get("/classes/:classId/sessions/:date/recording/video", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "unauthorized" }, 401);
		}
		const classId = c.req.param("classId") ?? "";
		const dateISO = parseStartDateStrict(c.req.param("date") ?? "");
		if (!dateISO) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "invalid date", reason: "invalid-date" }, 400);
		}
		const db = deps.getDb();
		const [cls] = await db
			.select({ id: classTable.id })
			.from(classTable)
			.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)))
			.limit(1);
		if (!cls) {
			c.header("Cache-Control", "no-store");
			return c.json({ error: "class not found" }, 404);
		}

		const store = deps.getRecordingStore?.();
		if (!store) {
			c.header("Cache-Control", "no-store");
			return c.json(
				{
					error: "Chưa cấu hình kho lưu trữ recording.",
					code: RECORDING_ERROR_CODES.DISABLED,
				},
				503,
			);
		}

		const [meeting] = await db
			.select({
				recordingStatus: classSessionMeeting.recordingStatus,
				recordingStorageKey: classSessionMeeting.recordingStorageKey,
				recordingMimeType: classSessionMeeting.recordingMimeType,
				recordingSizeBytes: classSessionMeeting.recordingSizeBytes,
				recordingExpiresAt: classSessionMeeting.recordingExpiresAt,
			})
			.from(classSessionMeeting)
			.where(
				and(
					eq(classSessionMeeting.orgId, ctx.orgId),
					eq(classSessionMeeting.classId, classId),
					eq(classSessionMeeting.date, dateISO),
				),
			)
			.limit(1);

		if (!meeting) {
			c.header("Cache-Control", "no-store");
			return c.json(
				{
					error: "Không tìm thấy recording.",
					code: RECORDING_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}

		const now = deps.now ? deps.now() : new Date();
		const isExpired =
			meeting.recordingStatus === "expired" ||
			Boolean(
				meeting.recordingStorageKey &&
					meeting.recordingExpiresAt &&
					meeting.recordingExpiresAt.getTime() <= now.getTime(),
			);
		if (isExpired) {
			c.header("Cache-Control", "no-store");
			return c.json(
				{
					error: "Recording đã hết hạn lưu trữ (90 ngày).",
					code: RECORDING_ERROR_CODES.EXPIRED,
				},
				410,
			);
		}

		if (!meeting.recordingStorageKey) {
			c.header("Cache-Control", "no-store");
			return c.json(
				{
					error: "Buổi học chưa có video recording lưu trữ.",
					code: RECORDING_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}

		const response = await recordingVideoResponse(
			store,
			{
				storageKey: meeting.recordingStorageKey,
				mimeType: meeting.recordingMimeType,
				sizeBytes: meeting.recordingSizeBytes,
				fileName: `recording-${dateISO}.mp4`,
			},
			{ rangeHeader: c.req.header("Range") },
		);

		if (!response) {
			c.header("Cache-Control", "no-store");
			return c.json(
				{
					error: "Không tìm thấy file video recording trong kho lưu trữ.",
					code: RECORDING_ERROR_CODES.NOT_FOUND,
				},
				404,
			);
		}

		return response;
	});

	return router;
}
