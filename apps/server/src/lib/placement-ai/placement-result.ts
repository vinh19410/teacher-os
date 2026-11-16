import {
	locatePlacementErrors,
	type PlacementAiSkillDraft,
	type PlacementError,
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

/**
 * Gửi link kết quả cho học viên (fail-open). Email chỉ chứa tên học viên +
 * link — không PII khác (MAILER_IMPL=log in nguyên body ra log).
 */
export async function sendPlacementResultEmail(params: {
	/** Getter có thể throw (mailer cấu hình sai trong `index.ts`) → "failed". */
	getMailer: () => Mailer | undefined;
	to: string | null | undefined;
	studentName: string;
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
	const greeting = params.studentName.trim()
		? `Chào ${params.studentName.trim()},`
		: "Chào bạn,";
	const lines = [
		greeting,
		"",
		"Cô Mỹ đã chấm xong bài kiểm tra đầu vào tiếng Anh của bạn.",
		"Bạn xem điểm, nhận xét và các lỗi cần sửa tại đường link sau:",
		params.resultUrl,
		"",
		"Chúc bạn học tốt!",
	];
	const text = lines.join("\n");
	const html = lines
		.map((line) =>
			line === params.resultUrl
				? `<a href="${escapeHtml(line)}">${escapeHtml(line)}</a>`
				: escapeHtml(line),
		)
		.join("<br>");
	try {
		await mailer.send({
			to,
			subject: "Kết quả bài kiểm tra đầu vào tiếng Anh",
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
