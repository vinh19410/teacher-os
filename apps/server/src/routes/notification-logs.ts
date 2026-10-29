import {
	NOTIFICATION_STATUSES,
	type NotificationLogResponse,
	type NotificationLogRow,
	type NotificationStatus,
	notificationLogQuerySchema,
	resendFailedBodySchema,
} from "@teacher-os/api/contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { notificationRecord, student } from "@teacher-os/db/schema/index";
import { and, count, desc, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import { deliverNotifications } from "../lib/notifications/deliver";
import { notificationDepsFrom } from "../lib/notifications/emit";
import {
	buildNotificationLogFilter,
	requeueFailedNotifications,
	requeueSingleFailedNotification,
} from "../lib/notifications/requeue";

type Env = { Variables: { kernelCtx: KernelCtx } };
type NotificationLogContext = Context<Env>;

/** Số dòng mỗi trang — khớp `pageSize: z.literal(20)` trong contract. */
const PAGE_SIZE = 20;

/**
 * Màn [5] Nhật ký gửi thông báo (#454, plan TOS-21 phase 5). Route ĐỌC
 * org-scoped, mount TRONG kernelRoutes (`kernel.route("/notification-logs",
 * …)`) để thừa hưởng Origin guard + role gate teacher — không mount standalone.
 *
 * GET /api/notification-logs?q=&event=&status=&page=
 * - `q` tìm lower LIKE (escape % _ \\) trên tên học viên / recipient_email / title.
 * - `event` lọc event_group, `status` lọc status.
 * - `counts` (cho chip trạng thái) tính trên bộ lọc q + event — KHÔNG áp
 *   status — bằng 1 query GROUP BY status (tránh N+1) kèm tổng "all".
 */
export interface NotificationLogRouteDeps {
	getDb(): Db;
	mailer?: Mailer;
	runInBackground?(promise: Promise<unknown>): void;
	studentOrigin?: string;
	notificationRetryDelaysMs?: number[];
}

export function notificationLogRoutes(deps: NotificationLogRouteDeps) {
	const routes = new Hono<Env>();

	async function triggerResendDelivery(requeuedIds: string[]): Promise<void> {
		if (requeuedIds.length === 0) return;
		const notifDeps = notificationDepsFrom(deps);
		const delivery = deliverNotifications(
			notifDeps.db,
			notifDeps.mailer,
			requeuedIds,
			notifDeps.studentOrigin,
			notifDeps.retryDelaysMs
				? { retryDelaysMs: notifDeps.retryDelaysMs }
				: undefined,
		).catch((error) => {
			console.error("[notifications] resend deliver failed", error);
		});
		if (notifDeps.runInBackground) {
			notifDeps.runInBackground(delivery);
		} else {
			await delivery;
		}
	}

	routes.get("/", async (c: NotificationLogContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const rawPage = c.req.query("page");
		const parsed = notificationLogQuerySchema.safeParse({
			q: c.req.query("q") || undefined,
			event: c.req.query("event") || undefined,
			status: c.req.query("status") || undefined,
			page:
				rawPage === null || rawPage === undefined ? undefined : Number(rawPage),
		});
		if (!parsed.success) return c.json({ error: "invalid query" }, 400);
		const { q, event, status } = parsed.data;
		const page = parsed.data.page ?? 1;

		const db = deps.getDb();

		// counts (chip trạng thái): q + event, KHÔNG status.
		const countWhere = buildNotificationLogFilter(ctx.orgId, { q, event });
		// rows + total: đầy đủ q + event + status.
		const rowWhere = and(
			countWhere,
			status ? eq(notificationRecord.status, status) : undefined,
		);

		const [rows, totalRows, statusGroups] = await Promise.all([
			db
				.select({
					id: notificationRecord.id,
					createdAt: notificationRecord.createdAt,
					recipientName: student.name,
					recipientEmail: notificationRecord.recipientEmail,
					eventType: notificationRecord.eventType,
					eventGroup: notificationRecord.eventGroup,
					channels: notificationRecord.channels,
					status: notificationRecord.status,
					title: notificationRecord.title,
					body: notificationRecord.body,
					linkPath: notificationRecord.linkPath,
					senderName: notificationRecord.senderName,
					replyToEmail: notificationRecord.replyToEmail,
					sentAt: notificationRecord.sentAt,
					readAt: notificationRecord.readAt,
					retryCount: notificationRecord.retryCount,
					lastError: notificationRecord.lastError,
					refType: notificationRecord.refType,
					refId: notificationRecord.refId,
				})
				.from(notificationRecord)
				.innerJoin(student, eq(student.id, notificationRecord.studentId))
				.where(rowWhere)
				.orderBy(
					desc(notificationRecord.createdAt),
					desc(notificationRecord.id),
				)
				.limit(PAGE_SIZE)
				.offset((page - 1) * PAGE_SIZE),
			db
				.select({ total: count() })
				.from(notificationRecord)
				.innerJoin(student, eq(student.id, notificationRecord.studentId))
				.where(rowWhere),
			db
				.select({ status: notificationRecord.status, n: count() })
				.from(notificationRecord)
				.innerJoin(student, eq(student.id, notificationRecord.studentId))
				.where(countWhere)
				.groupBy(notificationRecord.status),
		]);

		const total = totalRows[0]?.total ?? 0;
		const counts: Record<NotificationStatus | "all", number> = {
			queued: 0,
			sent: 0,
			read: 0,
			failed: 0,
			all: 0,
		};
		let all = 0;
		for (const group of statusGroups) {
			if ((NOTIFICATION_STATUSES as readonly string[]).includes(group.status)) {
				counts[group.status as NotificationStatus] = group.n;
				all += group.n;
			}
		}
		counts.all = all;

		const response: NotificationLogResponse = {
			rows: rows.map(
				(row): NotificationLogRow => ({
					id: row.id,
					createdAt: row.createdAt.toISOString(),
					recipientName: row.recipientName,
					recipientEmail: row.recipientEmail,
					eventType: row.eventType as NotificationLogRow["eventType"],
					eventGroup: row.eventGroup as NotificationLogRow["eventGroup"],
					channels: row.channels,
					status: row.status,
					title: row.title,
					body: row.body,
					linkPath: row.linkPath,
					senderName: row.senderName,
					replyToEmail: row.replyToEmail,
					sentAt: row.sentAt ? row.sentAt.toISOString() : null,
					readAt: row.readAt ? row.readAt.toISOString() : null,
					retryCount: row.retryCount,
					lastError: row.lastError,
					refType: row.refType,
					refId: row.refId,
				}),
			),
			total,
			counts,
			page,
			pageSize: PAGE_SIZE,
		};
		return c.json(response);
	});

	routes.post("/resend-failed", async (c: NotificationLogContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		let rawBody: unknown = {};
		const text = await c.req.text();
		if (text.trim().length > 0) {
			try {
				rawBody = JSON.parse(text);
			} catch {
				return c.json({ error: "invalid json" }, 400);
			}
		}
		const parsed = resendFailedBodySchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const { response, requeuedIds } = await requeueFailedNotifications(
			deps.getDb(),
			ctx.orgId,
			{
				q: parsed.data.q,
				event: parsed.data.event,
			},
		);
		await triggerResendDelivery(requeuedIds);
		return c.json(response);
	});

	routes.post("/:id/resend", async (c: NotificationLogContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const id = c.req.param("id") ?? "";
		const result = await requeueSingleFailedNotification(
			deps.getDb(),
			ctx.orgId,
			id,
		);
		if (result.kind === "not_found") {
			return c.json({ error: "not_found" }, 404);
		}
		if (result.kind === "not_failed") {
			return c.json({ error: "not_failed" }, 409);
		}

		await triggerResendDelivery(result.requeuedIds);
		return c.json(result.response);
	});

	return routes;
}
