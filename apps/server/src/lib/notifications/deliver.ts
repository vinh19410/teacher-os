import {
	MAX_EMAIL_ATTEMPTS,
	NOTIFICATION_ERROR_CODES,
} from "@teacher-os/api/contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { notificationRecord } from "@teacher-os/db/schema/notification-record";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../../app";

/** last_error cắt 500 ký tự; message lỗi Resend không chứa API key (chỉ header Bearer). */
const LAST_ERROR_MAX = 500;
const DEFAULT_RETRY_DELAYS_MS = [2000, 5000] as const;

function retryIncrement() {
	// SQL increment để chạy song song không ghi đè retry_count của nhau.
	return sql`${notificationRecord.retryCount} + 1`;
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/**
 * Che Bearer token / Resend API key nếu upstream vô tình phản chiếu trong
 * error message, bỏ tiền tố E-selfomy-alignment-010 trùng lặp, và cắt ≤ 500
 * ký tự cho cả bản thô (lượt 1–2) lẫn bản có tiền tố mã lỗi (lượt 3 -> failed).
 */
export function sanitizeDeliveryError(raw: string): {
	rawError: string;
	failedError: string;
} {
	const prefix = `${NOTIFICATION_ERROR_CODES.DELIVERY_FAILED}:`;
	const redacted = raw
		.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
		.replace(/\bre_[A-Za-z0-9_]+\b/g, "[REDACTED]")
		.trim();
	const withoutPrefix = redacted.startsWith(prefix)
		? redacted.slice(prefix.length).trim()
		: redacted;
	const cleaned = withoutPrefix || "Unknown delivery error";
	return {
		rawError: cleaned.slice(0, LAST_ERROR_MAX),
		failedError:
			`${NOTIFICATION_ERROR_CODES.DELIVERY_FAILED}: ${cleaned}`.slice(
				0,
				LAST_ERROR_MAX,
			),
	};
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
	retryCount: number;
}
/** Origin cổng học viên dùng cho link tuyệt đối trong thư — inject từ AppDeps
 * (env STUDENT_ORIGINS là chuỗi thô, parse ở index.ts; test node truyền thủ công). */

export function renderText(body: string, linkUrl: string): string {
	return linkUrl ? `${body}\n\n${linkUrl}` : body;
}

/** Escape entities cho plain-text body và thuộc tính HTML khi nhúng vào email (CR M2, #570). */
export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function isSafeLinkUrl(linkUrl: string): boolean {
	return (
		linkUrl.startsWith("https://") ||
		linkUrl.startsWith("http://") ||
		(linkUrl.startsWith("/") && !linkUrl.startsWith("//"))
	);
}

export function renderHtml(
	body: string,
	linkUrl: string,
	ctaLabel = "Mở xem",
): string {
	const safeUrl = linkUrl && isSafeLinkUrl(linkUrl) ? escapeHtml(linkUrl) : "";
	const linkHtml = safeUrl
		? `<p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none">${escapeHtml(ctaLabel)}</a></p>`
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
 * Gửi email cho các bản ghi `queued` có kênh email với tối đa 3 lượt thử
 * (TOS-21 D4, TOS-22 D1–D4).
 * - OK → sent (hoặc read nếu read_at đã có — read_at là nguồn chân lý), xóa last_error = null.
 * - Lỗi mailer lượt 1–2 → giữ queued, retry_count+1, last_error.
 * - Lỗi mailer chạm lượt 3 (retry_count + 1 >= 3) → status = 'failed',
 *   last_error = "E-selfomy-alignment-010: <nguyên nhân>" (nguyên tử trong SQL).
 * - Update có điều kiện status='queued' và mỗi lượt đều re-select từ DB để chạy
 *   song song không gửi trùng hoặc ghi đè. Vắng mailer → giữ queued + log cảnh báo (D6).
 */
export async function deliverNotifications(
	db: Db,
	mailer: Mailer | undefined,
	ids: string[],
	studentOrigin = "",
	options?: { retryDelaysMs?: number[] },
): Promise<void> {
	if (ids.length === 0) return;
	if (!mailer) {
		console.warn(
			"[notifications] no mailer configured — %d record(s) stay queued",
			ids.length,
		);
		return;
	}

	const delays = options?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
	let pendingIds = [...ids];

	for (
		let pass = 0;
		pass < MAX_EMAIL_ATTEMPTS && pendingIds.length > 0;
		pass++
	) {
		if (pass > 0) {
			const delayMs = delays[pass - 1] ?? 0;
			await sleep(delayMs);
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
				retryCount: notificationRecord.retryCount,
			})
			.from(notificationRecord)
			.where(
				and(
					inArray(notificationRecord.id, pendingIds),
					eq(notificationRecord.status, "queued"),
					lt(notificationRecord.retryCount, MAX_EMAIL_ATTEMPTS),
				),
			)) as QueuedRow[];

		const nextPendingIds: string[] = [];

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
					idempotencyKey: row.id,
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
						sentAt: new Date(),
						lastError: null,
					})
					.where(
						and(
							eq(notificationRecord.id, row.id),
							eq(notificationRecord.status, "queued"),
						),
					);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const { rawError, failedError } = sanitizeDeliveryError(message);
				await db
					.update(notificationRecord)
					.set({
						retryCount: retryIncrement(),
						status: sql`CASE WHEN ${notificationRecord.retryCount} + 1 >= ${MAX_EMAIL_ATTEMPTS} THEN 'failed' ELSE ${notificationRecord.status} END`,
						lastError: sql`CASE WHEN ${notificationRecord.retryCount} + 1 >= ${MAX_EMAIL_ATTEMPTS} THEN ${failedError} ELSE ${rawError} END`,
					})
					.where(
						and(
							eq(notificationRecord.id, row.id),
							eq(notificationRecord.status, "queued"),
						),
					);
				if (row.retryCount + 1 < MAX_EMAIL_ATTEMPTS) {
					nextPendingIds.push(row.id);
				}
			}
		}

		pendingIds = nextPendingIds;
	}
}
