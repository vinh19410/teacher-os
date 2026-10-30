import {
	LEAD_COURSE_LABELS,
	LEAD_STUDY_DAY_LABELS,
	LEAD_STUDY_MODE_LABELS,
	LEAD_TIME_SLOT_LABELS,
	type LeadRow,
} from "@teacher-os/api/lead-contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { user } from "@teacher-os/db/schema/auth";
import { membership } from "@teacher-os/db/schema/membership";
import { eq } from "drizzle-orm";
import type { Db } from "../app";
import { escapeHtml } from "./notifications/deliver";

/**
 * Email báo lead mới (plan #506 D13) — chạy nền sau khi lead đã ghi DB;
 * lỗi mailer KHÔNG bao giờ đổi response của POST /public/leads.
 *
 * Không PII trong email (SĐT/email/ngày sinh/ghi chú) vì MAILER_IMPL=log
 * in nguyên body ra log: giáo viên mở app web để xem chi tiết.
 */
export async function notifyNewLead({
	db,
	mailer,
	orgId,
	lead,
	appOrigin,
}: {
	db: Db;
	mailer?: Mailer;
	orgId: string;
	lead: LeadRow;
	/** Origin app web cho link tuyệt đối; vắng → link tương đối. */
	appOrigin?: string;
}): Promise<void> {
	if (!mailer) {
		console.warn("[leads] mailer missing, skip notify", lead.id);
		return;
	}
	let recipients: string[];
	try {
		const rows = await db
			.select({ email: user.email })
			.from(membership)
			.innerJoin(user, eq(user.id, membership.userId))
			.where(eq(membership.orgId, orgId));
		recipients = [
			...new Set(
				rows
					.map((row) => row.email.trim().toLowerCase())
					.filter((email) => email.length > 0),
			),
		];
	} catch (error) {
		// Không PII, không body — chỉ lead id để đối chiếu.
		console.error("[leads] query recipients failed", lead.id, error);
		return;
	}
	if (recipients.length === 0) return;

	const parts: string[] = [`Học viên tiềm năng: ${lead.name}`];
	if (lead.course) {
		parts.push(
			`Khóa: ${LEAD_COURSE_LABELS[lead.course as keyof typeof LEAD_COURSE_LABELS] ?? lead.course}`,
		);
	}
	if (lead.studyMode) {
		parts.push(
			`Hình thức: ${LEAD_STUDY_MODE_LABELS[lead.studyMode as keyof typeof LEAD_STUDY_MODE_LABELS] ?? lead.studyMode}`,
		);
	}
	const schedule = [
		lead.studyDays
			? (LEAD_STUDY_DAY_LABELS[
					lead.studyDays as keyof typeof LEAD_STUDY_DAY_LABELS
				] ?? lead.studyDays)
			: "",
		lead.timeSlot
			? (LEAD_TIME_SLOT_LABELS[
					lead.timeSlot as keyof typeof LEAD_TIME_SLOT_LABELS
				] ?? lead.timeSlot)
			: "",
	]
		.filter(Boolean)
		.join(", ");
	if (schedule) parts.push(`Lịch mong muốn: ${schedule}`);
	parts.push(`Xem chi tiết: ${appOrigin ? appOrigin : ""}/leads?status=new`);

	const text = parts.join("\n");
	await Promise.all(
		recipients.map((to) =>
			mailer
				.send({
					to,
					subject: `Đăng ký học mới: ${lead.name}`,
					// `text` chứa name/note do người dùng gõ vào form — escape trước
					// khi nhúng vào HTML (cùng rule CR M2 của notification email).
					html: `<pre>${escapeHtml(text)}</pre>`,
					text,
				})
				.catch((error: unknown) => {
					// Nuốt lỗi — lead vẫn lưu, response không đổi; log không PII.
					console.error("[leads] notify send failed", lead.id, error);
				}),
		),
	);
}
