import {
	type NotificationEventGroup,
	type NotificationResendResponse,
	type NotificationStatus,
	RESEND_BATCH_LIMIT,
} from "@teacher-os/api/contracts";
import { notificationRecord, student } from "@teacher-os/db/schema/index";
import { and, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Db } from "../../app";

/**
 * Dựng điều kiện lọc `q` (escape `%`, `_`, `\`) cho màn [5] Nhật ký thông báo
 * và API Gửi lại (#454, #464).
 * - Đối với `student.email` hiện tại: chỉ đối chiếu khi bản ghi có kênh email
 *   hoặc đã có `recipient_email`, hoặc khi gọi từ luồng `requeueFailedNotifications`
 *   (`matchCurrentStudentEmail = true`), để bản ghi chỉ `in_app` (`recipientEmail = null`)
 *   không bị khớp nhầm theo email học viên trên `GET /api/notification-logs`.
 */
export function buildNotificationQFilter(
	q: string | undefined,
	options?: { matchCurrentStudentEmail?: boolean },
): SQL | undefined {
	const trimmedQ = q?.trim() ?? "";
	if (!trimmedQ) return undefined;
	const pattern = `%${trimmedQ.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
	if (options?.matchCurrentStudentEmail) {
		return sql`(
			lower(${student.name}) LIKE ${pattern} ESCAPE '\\'
			OR lower(coalesce(${notificationRecord.recipientEmail}, '')) LIKE ${pattern} ESCAPE '\\'
			OR lower(coalesce(${student.email}, '')) LIKE ${pattern} ESCAPE '\\'
			OR lower(${notificationRecord.title}) LIKE ${pattern} ESCAPE '\\'
		)`;
	}
	return sql`(
		lower(${student.name}) LIKE ${pattern} ESCAPE '\\'
		OR lower(coalesce(${notificationRecord.recipientEmail}, '')) LIKE ${pattern} ESCAPE '\\'
		OR (${notificationRecord.recipientEmail} IS NOT NULL AND lower(coalesce(${student.email}, '')) LIKE ${pattern} ESCAPE '\\')
		OR lower(${notificationRecord.title}) LIKE ${pattern} ESCAPE '\\'
	)`;
}

export function buildNotificationLogFilter(
	orgId: string,
	filter: {
		q?: string;
		event?: NotificationEventGroup;
		status?: NotificationStatus;
		matchCurrentStudentEmail?: boolean;
	},
): SQL | undefined {
	return and(
		eq(notificationRecord.orgId, orgId),
		buildNotificationQFilter(filter.q, {
			matchCurrentStudentEmail: filter.matchCurrentStudentEmail,
		}),
		filter.event ? eq(notificationRecord.eventGroup, filter.event) : undefined,
		filter.status ? eq(notificationRecord.status, filter.status) : undefined,
	);
}

export type RequeueSingleResult =
	| { kind: "not_found" }
	| { kind: "not_failed" }
	| {
			kind: "ok";
			response: NotificationResendResponse;
			requeuedIds: string[];
	  };

/**
 * Đặt lại 1 bản ghi `failed` của `orgId` về `queued` (`retry_count = 0`,
 * `last_error = null`, cập nhật `recipient_email` từ `student.email` hiện tại).
 * Không INSERT, không đổi `idempotency_key` hay `read_at` (TOS-23 D1, D2, D5).
 */
export async function requeueSingleFailedNotification(
	db: Db,
	orgId: string,
	id: string,
): Promise<RequeueSingleResult> {
	const [row] = await db
		.select({
			id: notificationRecord.id,
			status: notificationRecord.status,
			studentEmail: student.email,
		})
		.from(notificationRecord)
		.innerJoin(student, eq(student.id, notificationRecord.studentId))
		.where(
			and(eq(notificationRecord.orgId, orgId), eq(notificationRecord.id, id)),
		);

	if (!row) {
		return { kind: "not_found" };
	}
	if (row.status !== "failed") {
		return { kind: "not_failed" };
	}
	if (row.studentEmail.trim() === "") {
		return {
			kind: "ok",
			response: {
				requeued: 0,
				skipped: [{ id: row.id, reason: "no_email" }],
				remaining: 0,
			},
			requeuedIds: [],
		};
	}

	const updated = await db
		.update(notificationRecord)
		.set({
			status: "queued",
			retryCount: 0,
			lastError: null,
			recipientEmail: sql`(SELECT trim(${student.email}) FROM ${student} WHERE ${student.id} = ${notificationRecord.studentId} AND ${student.orgId} = ${notificationRecord.orgId})`,
			channels: sql`CASE WHEN ${notificationRecord.channels} = 'in_app' THEN 'email,in_app' WHEN ${notificationRecord.channels} = '' THEN 'email' ELSE ${notificationRecord.channels} END`,
		})
		.where(
			and(
				eq(notificationRecord.orgId, orgId),
				eq(notificationRecord.id, id),
				eq(notificationRecord.status, "failed"),
				sql`EXISTS (SELECT 1 FROM ${student} WHERE ${student.id} = ${notificationRecord.studentId} AND ${student.orgId} = ${notificationRecord.orgId} AND length(trim(${student.email})) > 0)`,
			),
		)
		.returning({ id: notificationRecord.id });

	if (updated.length === 0) {
		return { kind: "not_failed" };
	}

	return {
		kind: "ok",
		response: {
			requeued: updated.length,
			skipped: [],
			remaining: 0,
		},
		requeuedIds: updated.map((r) => r.id),
	};
}

/**
 * Đặt lại tối đa `limit` (mặc định `RESEND_BATCH_LIMIT = 50`) bản ghi `failed`
 * mới nhất có `student.email` hợp lệ khớp bộ lọc `q + event` của `orgId`.
 * Các bản ghi `failed` của học viên trống email được tách riêng vào `skipped`
 * để không gây nghẽn đầu hàng đợi (head-of-line starvation) và không tính vào
 * `remaining`.
 */
export async function requeueFailedNotifications(
	db: Db,
	orgId: string,
	filter: {
		q?: string;
		event?: NotificationEventGroup;
		limit?: number;
	} = {},
): Promise<{
	response: NotificationResendResponse;
	requeuedIds: string[];
}> {
	const limit = filter.limit ?? RESEND_BATCH_LIMIT;
	const baseWhere = buildNotificationLogFilter(orgId, {
		q: filter.q,
		event: filter.event,
		status: "failed",
		matchCurrentStudentEmail: true,
	});

	const hasEmailCondition = sql`length(trim(${student.email})) > 0`;
	const noEmailCondition = sql`length(trim(${student.email})) = 0`;

	const [eligibleRows, eligibleCountRows, noEmailRows] = await Promise.all([
		db
			.select({ id: notificationRecord.id })
			.from(notificationRecord)
			.innerJoin(student, eq(student.id, notificationRecord.studentId))
			.where(and(baseWhere, hasEmailCondition))
			.orderBy(desc(notificationRecord.createdAt), desc(notificationRecord.id))
			.limit(limit),
		db
			.select({ total: count() })
			.from(notificationRecord)
			.innerJoin(student, eq(student.id, notificationRecord.studentId))
			.where(and(baseWhere, hasEmailCondition)),
		db
			.select({ id: notificationRecord.id })
			.from(notificationRecord)
			.innerJoin(student, eq(student.id, notificationRecord.studentId))
			.where(and(baseWhere, noEmailCondition))
			.orderBy(desc(notificationRecord.createdAt), desc(notificationRecord.id)),
	]);

	const totalEligible = eligibleCountRows[0]?.total ?? 0;
	const targetIds = eligibleRows.map((r) => r.id);

	let requeuedIds: string[] = [];
	if (targetIds.length > 0) {
		const updated = await db
			.update(notificationRecord)
			.set({
				status: "queued",
				retryCount: 0,
				lastError: null,
				recipientEmail: sql`(SELECT trim(${student.email}) FROM ${student} WHERE ${student.id} = ${notificationRecord.studentId} AND ${student.orgId} = ${notificationRecord.orgId})`,
				channels: sql`CASE WHEN ${notificationRecord.channels} = 'in_app' THEN 'email,in_app' WHEN ${notificationRecord.channels} = '' THEN 'email' ELSE ${notificationRecord.channels} END`,
			})
			.where(
				and(
					eq(notificationRecord.orgId, orgId),
					inArray(notificationRecord.id, targetIds),
					eq(notificationRecord.status, "failed"),
					sql`EXISTS (SELECT 1 FROM ${student} WHERE ${student.id} = ${notificationRecord.studentId} AND ${student.orgId} = ${notificationRecord.orgId} AND length(trim(${student.email})) > 0)`,
				),
			)
			.returning({ id: notificationRecord.id });
		requeuedIds = updated.map((r) => r.id);
	}

	const remaining = Math.max(0, totalEligible - requeuedIds.length);
	return {
		response: {
			requeued: requeuedIds.length,
			skipped: noEmailRows.map((r) => ({
				id: r.id,
				reason: "no_email" as const,
			})),
			remaining,
		},
		requeuedIds,
	};
}
