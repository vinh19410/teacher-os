import { notificationRecord } from "@teacher-os/db/schema/notification-record";
import { student } from "@teacher-os/db/schema/student";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../../app";
import { resolveOrgMailSender } from "./org-mail-sender";
import { eventGroupOf, type NotificationEvent } from "./templates";

/** Giới hạn biến D1: mỗi INSERT tối đa số dòng này. */
const INSERT_CHUNK = 50;

export interface EnqueueResult {
	/** id của các bản ghi MỚI được tạo (trùng khóa bị onConflictDoNothing bỏ). */
	createdIds: string[];
}

/**
 * Điền thông tin người nhận + snapshot sender/reply-to (D5) rồi chèn bản ghi
 * notification_record. Trùng (org_id, idempotency_key) → bỏ qua. Trả id dòng mới.
 */
export async function enqueueNotifications(
	db: Db,
	orgId: string,
	events: NotificationEvent[],
): Promise<EnqueueResult> {
	if (events.length === 0) return { createdIds: [] };

	const studentIds = [...new Set(events.map((e) => e.studentId))];
	const emailByStudent = new Map<string, string>();
	for (let i = 0; i < studentIds.length; i += INSERT_CHUNK) {
		const chunk = studentIds.slice(i, i + INSERT_CHUNK);
		const students = await db
			.select({ id: student.id, email: student.email })
			.from(student)
			.where(and(eq(student.orgId, orgId), inArray(student.id, chunk)));
		for (const s of students) {
			emailByStudent.set(s.id, s.email);
		}
	}
	const { senderName, replyToEmail } = await resolveOrgMailSender(db, orgId);
	const now = new Date();
	// Học viên không thuộc org → bỏ qua hoàn toàn (không tạo bản ghi).
	const rows = events
		.filter((event) => emailByStudent.has(event.studentId))
		.map((event) => {
			const recipientEmail = (emailByStudent.get(event.studentId) ?? "").trim();
			const hasEmail = recipientEmail.length > 0;
			return {
				id: crypto.randomUUID(),
				orgId,
				studentId: event.studentId,
				eventType: event.eventType,
				eventGroup: eventGroupOf(event.eventType),
				idempotencyKey: event.idempotencyKey,
				title: event.title,
				body: event.body,
				linkPath: event.linkPath,
				refType: event.refType,
				refId: event.refId,
				channels: hasEmail ? "email,in_app" : "in_app",
				recipientEmail: hasEmail ? recipientEmail : null,
				senderName,
				replyToEmail,
				// Chỉ in-app → đã "gửi" ngay khi tạo, không có gì để deliver (D4).
				status: hasEmail ? ("queued" as const) : ("sent" as const),
				sentAt: hasEmail ? null : now,
			};
		});

	const createdIds: string[] = [];
	for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
		const chunk = rows.slice(i, i + INSERT_CHUNK);
		const inserted = await db
			.insert(notificationRecord)
			.values(chunk)
			.onConflictDoNothing()
			.returning({ id: notificationRecord.id });
		createdIds.push(...inserted.map((r) => r.id));
	}
	return { createdIds };
}
