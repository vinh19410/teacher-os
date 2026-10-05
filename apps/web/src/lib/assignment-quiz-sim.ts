import type {
	AssignmentQuestion,
	StudentQuizQuestion,
} from "@teacher-os/api/contracts";
import { inferQuestionTypes } from "@teacher-os/api/lib/infer-question-types";
import type { QuizPaperDetail } from "@teacher-os/ui/components/quiz/quiz-paper";
import type { QuestionItem } from "@/components/assignments/assignment-presets";
import type { PreviewDraft } from "@/lib/assignment-preview-draft";
import { isValidPin } from "@/lib/image-pin";

/** Simulation dựng được từ draft preview (đề auto-graded + items hợp lệ). */
export interface QuizSimulation {
	/** Paper chrome cho QuizPaper — skill/type đã resolve qua preset. */
	detail: QuizPaperDetail;
	/** Questions ĐÃ strip key — chỉ dùng render take (mirror server strip
	 * `{stem, opts, pin}` ở GET /quiz của student). */
	takeQuestions: StudentQuizQuestion[];
	/** Full-key questions cùng thứ tự index — chỉ đi vào `gradeQuiz` lúc nộp. */
	fullQuestions: AssignmentQuestion[];
	/** Note đề (prompt-level) — withhold ở take, chỉ reveal ở review. */
	note: string;
	/** Identity của đề đang simulate (bank `prompt.id` | draft fingerprint) —
	 * route reset state khi key này đổi. */
	simKey: string;
}

/**
 * Fingerprint nội dung draft — `previewDraftFromPrompt` tạo object mới mỗi
 * render nên KHÔNG được dùng object identity làm key reset; fingerprint chỉ
 * đổi khi nội dung grading-relevant đổi (skill/part/type/task/genre/items).
 */
export function draftSimKey(draft: PreviewDraft): string {
	return JSON.stringify([
		draft.skill ?? null,
		draft.part ?? null,
		draft.type ?? null,
		draft.task,
		draft.genre,
		draft.items ?? null,
	]);
}

/**
 * Dựng simulation cho preview giáo viên từ draft (bank `?id=` lẫn draft
 * sessionStorage — cùng shape PreviewDraft). Trả `null` khi đề không
 * auto-graded (writing/speaking) hoặc không dựng được items nào — route giữ
 * nguyên layout hiện trạng.
 *
 * Resolver KHỚP NGUYÊN VĂN công thức render câu hỏi của `StudentPreviewPaper`
 * (L41-47): `skill ?? "writing"` (skill KHÔNG fallback task/genre),
 * `type ?? genre ?? "discuss"` — dùng type RAW, không resolve qua preset
 * fallback: tab "Đề bài" render opts/cloze bằng chính chuỗi này, và take
 * screen student cũng nhận type raw từ payload server. Resolve thêm một tầng
 * fallback nào ở đây sẽ làm 2 tab hiện widget khác nhau cho cùng một draft
 * (vd draft giữ type `mcq` sau khi đổi part → fallback `tfng` đổi pill + chấm
 * sai letter key).
 */
export function buildQuizSim(
	draft: PreviewDraft,
	simKey: string = draftSimKey(draft),
): QuizSimulation | null {
	const skillId = draft.skill ?? "writing";
	if (skillId !== "reading" && skillId !== "listening") return null;
	const typeId = draft.type ?? draft.genre ?? "discuss";
	// Normalize mirror `parseQuizQuestions` (server): default `alts`/`answer`
	// rỗng, lọc opts non-string, pin invalid về null, bỏ item thiếu stem —
	// không để TypeError trong `gradeQuiz` lúc nộp hay crash render take với
	// items legacy malformed.
	const fullQuestions = (draft.items ?? [])
		.filter((item) => typeof item.stem === "string" && item.stem.trim() !== "")
		.map(normalizeQuestion);
	if (fullQuestions.length === 0) return null;
	// Type hiệu dụng từng câu — cùng helper với take/review payload của server
	// (type riêng ?? type đề, kèm suy luận tfng/ynng cho câu T/F/NG markerless).
	const types = inferQuestionTypes(fullQuestions, typeId);
	const takeQuestions: StudentQuizQuestion[] = fullQuestions.map(
		(question, index) => ({
			stem: question.stem,
			opts: question.opts,
			type: types[index] ?? typeId,
			pin: question.pin ?? null,
		}),
	);
	const detail: QuizPaperDetail = {
		// Transcript (nguồn đáp án listening) không thuộc paper take —
		// QuizPaper không render và student wire không bao giờ mang nó.
		skill: skillId,
		type: typeId,
		band: draft.band,
		intro: draft.intro ?? "",
		prompt: draft.prompt,
		passage: draft.passage ?? "",
		cueTopic: draft.cueTopic ?? "",
		cuePoints: draft.cuePoints ?? "",
		audioName: draft.audioName ?? "",
		imageUrl: draft.imageUrl ?? "",
		optionBank: draft.optionBank ?? [],
	};
	return { detail, takeQuestions, fullQuestions, note: draft.note, simKey };
}

/** Item soạn/draft có thể thiếu field ở runtime (JSON cũ) — ép về contract
 * với cùng rule sanitize như `parseQuizQuestions`/`parsePin` phía server:
 * opts chỉ giữ string, pin không hợp lệ về null (câu fallback hàng cloze
 * thường — vẫn trả lời được, không thành "câu chết" không widget). */
function normalizeQuestion(item: QuestionItem): AssignmentQuestion {
	return {
		stem: item.stem,
		opts: Array.isArray(item.opts)
			? item.opts.filter(
					(option): option is string => typeof option === "string",
				)
			: null,
		answer: typeof item.answer === "string" ? item.answer : "",
		alts: typeof item.alts === "string" ? item.alts : "",
		type: typeof item.type === "string" && item.type !== "" ? item.type : null,
		pin: isValidPin(item.pin) ? item.pin : null,
	};
}
