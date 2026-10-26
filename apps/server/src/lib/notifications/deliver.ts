import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { notificationRecord } from "@teacher-os/db/schema/notification-record";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../app";

/** last_error cắt 500 ký tự; message lỗi Resend không chứa API key (chỉ header Bearer). */
const LAST_ERROR_MAX = 500;

function retryIncrement() {
	// SQL increment để chạy song song không ghi đè retry_count của nhau.
	return sql`${notificationRecord.retryCount} + 1`;
}

interface QueuedRow {
	id: string;
	title: string;
	body: string;
	linkPath: string;
	recipientEmail: string | null;
	senderName: string;
	replyToEmail: string | null;
	channels: string;
	readAt: Date | null;
}

/** Origin cổng học viên dùng cho link tuyệt đối trong thư — inject từ AppDeps
 * (env STUDENT_ORIGINS là chuỗi thô, parse ở index.ts; test node truyền thủ công). */

function renderText(body: string, linkUrl: string): string {
	return linkUrl ? `${body}\n\n${linkUrl}` : body;
}

/** Escape entities cho plain-text body khi nhúng vào HTML email (CR M2). */
function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function renderHtml(body: string, linkUrl: string): string {
	const escapedLink = linkUrl.replaceAll("&", "&amp;");
	const linkHtml = linkUrl
		? `<p style="margin:24px 0"><a href="${escapedLink}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none">Mở xem</a></p>`
		: "";
	return [
		'<!DOCTYPE html><html lang="vi"><body style="margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc">',
		'<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px">',
		`<p style="font-size:15px;line-height:1.6;color:#0f172a">${escapeHtml(body)}</p>`,
		linkHtml,
		'<p style="font-size:12px;color:#64748b;margin-top:24px">Email tự động từ Teacher OS.</p>',
		"</div></body></html>",
	].join("");
}

/**
 * Gửi email cho các bản ghi `queued` có kênh email (D4). OK → sent (hoặc read
 * nếu read_at đã có — read_at là nguồn chân truth). Lỗi mailer → giữ queued,
 * retry_count+1, last_error. Update có điều kiện status='queued' để chạy
 * song song không ghi đè. Vắng mailer → giữ queued + log cảnh báo (D6).
 */
export async function deliverNotifications(
	db: Db,
	mailer: Mailer | undefined,
	ids: string[],
	studentOrigin = "",
): Promise<void> {
	if (ids.length === 0) return;
	if (!mailer) {
		console.warn(
			"[notifications] no mailer configured — %d record(s) stay queued",
			ids.length,
		);
		return;
	}

	const rows = (await db
		.select({
			id: notificationRecord.id,
			title: notificationRecord.title,
			body: notificationRecord.body,
			linkPath: notificationRecord.linkPath,
			recipientEmail: notificationRecord.recipientEmail,
			senderName: notificationRecord.senderName,
			replyToEmail: notificationRecord.replyToEmail,
			channels: notificationRecord.channels,
			readAt: notificationRecord.readAt,
		})
		.from(notificationRecord)
		.where(
			and(
				inArray(notificationRecord.id, ids),
				eq(notificationRecord.status, "queued"),
			),
		)) as QueuedRow[];

	const now = new Date();

	for (const row of rows) {
		if (!row.channels.includes("email")) continue;
		if (!row.recipientEmail) continue;

		const linkUrl = row.linkPath
			? `${studentOrigin}${row.linkPath}`
			: studentOrigin;
		try {
			await mailer.send({
				to: row.recipientEmail,
				subject: row.title,
				html: renderHtml(row.body, linkUrl),
				text: renderText(row.body, linkUrl),
				...(row.replyToEmail ? { replyTo: row.replyToEmail } : {}),
				...(row.senderName
					? { fromName: `${row.senderName} qua Teacher OS` }
					: {}),
			});
			await db
				.update(notificationRecord)
				.set({
					// read_at là nguồn chân lý (D7): nếu học viên đọc trong lúc
					// thư còn gửi dở, status phải là read chứ không sent.
					status: sql`CASE WHEN ${notificationRecord.readAt} IS NULL THEN 'sent' ELSE 'read' END`,
					sentAt: now,
				})
				.where(
					and(
						eq(notificationRecord.id, row.id),
						eq(notificationRecord.status, "queued"),
					),
				);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await db
				.update(notificationRecord)
				.set({
					retryCount: retryIncrement(),
					lastError: message.slice(0, LAST_ERROR_MAX),
				})
				.where(
					and(
						eq(notificationRecord.id, row.id),
						eq(notificationRecord.status, "queued"),
					),
				);
		}
	}
}
