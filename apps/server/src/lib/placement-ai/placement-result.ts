import {
	locatePlacementErrors,
	type PlacementAiSkillDraft,
	type PlacementError,
	type PlacementSectionScore,
	placementErrorListSchema,
	placementSpeakingRubricSchema,
	placementWritingRubricSchema,
} from "@teacher-os/api/placement-test-contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import { z } from "zod";
import { escapeHtml } from "../notifications/deliver";

/** Đường dẫn trang kết quả công khai trên apps/profile. */
export const PLACEMENT_RESULT_PATH = "/kiem-tra-dau-vao/ket-qua/";
/** Token kết quả: 32 byte ngẫu nhiên dạng hex (64 ký tự). */
export const PLACEMENT_RESULT_TOKEN_RE = /^[0-9a-f]{64}$/;
const RESULT_EMAIL_TIMEOUT_MS = 5_000;

export function randomResultToken(): string {
	const buf = new Uint8Array(32);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Link tuyệt đối khi biết origin profile; vắng → đường dẫn tương đối. */
export function buildPlacementResultUrl(
	origin: string | undefined,
	token: string,
): string {
	return `${origin ?? ""}${PLACEMENT_RESULT_PATH}?t=${token}`;
}

function parseJson(raw: string | null): unknown {
	if (!raw) return undefined;
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

/** Danh sách lỗi đã lưu → định vị lại theo `text`; JSON hỏng → []. null khi cột null. */
export function parseStoredErrors(
	raw: string | null,
	text: string,
): PlacementError[] | null {
	if (raw === null) return null;
	const parsed = placementErrorListSchema.safeParse(parseJson(raw));
	return parsed.success ? locatePlacementErrors(text, parsed.data) : [];
}

const writingDraftSchema = z.object({
	rubric: placementWritingRubricSchema,
	feedback: z.string(),
	errors: placementErrorListSchema,
});
const speakingDraftSchema = z.object({
	rubric: placementSpeakingRubricSchema,
	feedback: z.string(),
	errors: placementErrorListSchema,
});

function parseDraft<R>(
	schema: z.ZodType<PlacementAiSkillDraft<R>>,
	raw: string | null,
	text: string,
): PlacementAiSkillDraft<R> | null {
	const parsed = schema.safeParse(parseJson(raw));
	if (!parsed.success) return null;
	return {
		...parsed.data,
		errors: locatePlacementErrors(text, parsed.data.errors),
	};
}

export function parseAiWritingDraft(raw: string | null, text: string) {
	return parseDraft(writingDraftSchema, raw, text);
}

export function parseAiSpeakingDraft(raw: string | null, transcript: string) {
	return parseDraft(speakingDraftSchema, raw, transcript);
}

export type PlacementResultEmailStatus = "sent" | "failed" | "skipped";

/** Số liệu tóm tắt trong email — cùng nguồn/định dạng với trang kết quả portal. */
export interface PlacementResultEmailSummary {
	cefr: string;
	displayCourse: string;
	scorePct: number;
	listening: PlacementSectionScore;
	vocabGrammar: PlacementSectionScore;
	reading: PlacementSectionScore;
	writingScore: number | null;
	/** null → bỏ dòng Speaking. */
	speakingScore: number | null;
}

/** `correct/total (pct%)` như portal; không có câu hỏi → "—". */
function formatObjectiveWithPct(score: PlacementSectionScore): string {
	if (!score || score.total <= 0) return "—";
	const pct = score.pct !== null ? ` (${Math.round(score.pct)}%)` : "";
	return `${score.correct}/${score.total}${pct}`;
}

const EMAIL_FONT =
	"font-family:Arial,Helvetica,sans-serif;color:#171717;font-size:14px;line-height:1.5;";
const CELL_STYLE = "padding:8px 12px;border-bottom:1px solid #e5e5e5;";

/**
 * Dựng email kết quả (HTML + text). Mọi giá trị động đều qua `escapeHtml`;
 * markup dạng bảng + CSS inline, không tài nguyên ngoài.
 */
export function renderPlacementResultEmail(params: {
	studentName: string;
	summary: PlacementResultEmailSummary;
	/** Link nút "Xem chi tiết kết quả" (portal hoặc trang kết quả công khai). */
	linkUrl: string;
}): { subject: string; html: string; text: string } {
	const { summary, linkUrl } = params;
	const name = params.studentName.trim();
	const greeting = name ? `Chào ${name},` : "Chào bạn,";
	const intro = "Cô Mỹ đã chấm xong bài kiểm tra đầu vào tiếng Anh của bạn.";
	const overview: [string, string][] = [
		["Trình độ CEFR", summary.cefr || "—"],
		["Khóa học đề xuất", summary.displayCourse || "—"],
		["Điểm tổng hợp", `${Math.round(summary.scorePct)}%`],
	];
	const skills: [string, string][] = [
		["Listening", formatObjectiveWithPct(summary.listening)],
		["Từ vựng & Ngữ pháp", formatObjectiveWithPct(summary.vocabGrammar)],
		["Reading", formatObjectiveWithPct(summary.reading)],
		[
			"Writing",
			summary.writingScore !== null ? `${summary.writingScore}/15 điểm` : "—",
		],
	];
	if (summary.speakingScore !== null) {
		skills.push(["Speaking", `${summary.speakingScore}/20 điểm`]);
	}

	const text = [
		greeting,
		"",
		intro,
		"",
		...overview.map(([label, value]) => `${label}: ${value}`),
		"",
		"Điểm các kỹ năng:",
		...skills.map(([label, value]) => `- ${label}: ${value}`),
		"",
		"Xem chi tiết kết quả (nhận xét và các lỗi cần sửa) tại:",
		linkUrl,
		"",
		"Chúc bạn học tốt!",
	].join("\n");

	const row = ([label, value]: [string, string], strong: boolean) =>
		`<tr><td style="${CELL_STYLE}color:#525252;">${escapeHtml(label)}</td>` +
		`<td style="${CELL_STYLE}text-align:right;${strong ? "font-weight:bold;" : ""}">${escapeHtml(value)}</td></tr>`;
	const table = (rows: [string, string][], strong: boolean) =>
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e5e5;margin:0 0 16px 0;">${rows
			.map((r) => row(r, strong))
			.join("")}</table>`;
	const href = escapeHtml(linkUrl);

	const html = [
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;"><tr><td align="center" style="padding:24px 12px;">`,
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e5e5;"><tr><td style="padding:24px;${EMAIL_FONT}">`,
		`<p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>`,
		`<p style="margin:0 0 20px 0;">${escapeHtml(intro)}</p>`,
		table(overview, true),
		`<p style="margin:0 0 8px 0;font-weight:bold;">Điểm các kỹ năng</p>`,
		table(skills, false),
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;"><tr><td style="background-color:#171717;border-radius:6px;">`,
		`<a href="${href}" target="_blank" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;">Xem chi tiết kết quả</a>`,
		"</td></tr></table>",
		`<p style="margin:0 0 12px 0;color:#525252;font-size:12px;">Nếu nút không hoạt động, mở đường link sau: <a href="${href}" style="color:#171717;">${href}</a></p>`,
		`<p style="margin:0;">Chúc bạn học tốt!</p>`,
		"</td></tr></table>",
		"</td></tr></table>",
	].join("");

	return {
		subject: "Kết quả bài kiểm tra đầu vào tiếng Anh",
		html,
		text,
	};
}

/**
 * Gửi tóm tắt kết quả + link chi tiết cho học viên (fail-open). Email gồm tên
 * học viên, điểm/trình độ/khóa đề xuất và link — không PII liên hệ (SĐT,
 * email) trong nội dung (MAILER_IMPL=log in nguyên body ra log).
 */
export async function sendPlacementResultEmail(params: {
	/** Getter có thể throw (mailer cấu hình sai trong `index.ts`) → "failed". */
	getMailer: () => Mailer | undefined;
	to: string | null | undefined;
	studentName: string;
	summary: PlacementResultEmailSummary;
	/** Link chi tiết đã chọn (portal hoặc trang kết quả công khai). */
	resultUrl: string;
	submissionId: string;
}): Promise<PlacementResultEmailStatus> {
	const to = params.to?.trim() ?? "";
	if (!to) return "skipped";
	let mailer: Mailer | undefined;
	try {
		mailer = params.getMailer();
	} catch (error) {
		console.error(
			"[placement-ai] mailer unavailable",
			params.submissionId,
			error instanceof Error ? error.name : "unknown",
		);
		return "failed";
	}
	if (!mailer) return "skipped";
	const { subject, html, text } = renderPlacementResultEmail({
		studentName: params.studentName,
		summary: params.summary,
		linkUrl: params.resultUrl,
	});
	try {
		await mailer.send({
			to,
			subject,
			html,
			text,
			timeoutMs: RESULT_EMAIL_TIMEOUT_MS,
		});
		return "sent";
	} catch (error) {
		console.error(
			"[placement-ai] result email failed",
			params.submissionId,
			error instanceof Error ? error.name : "unknown",
		);
		return "failed";
	}
}
