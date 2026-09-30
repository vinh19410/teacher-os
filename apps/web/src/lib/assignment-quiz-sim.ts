import type {
	AssignmentQuestion,
	StudentQuizQuestion,
} from "@teacher-os/api/contracts";
import type { QuizPaperDetail } from "@teacher-os/ui/components/quiz/quiz-paper";
import {
	type QuestionItem,
	typeOf,
} from "@/components/assignments/assignment-presets";
import type { PreviewDraft } from "@/lib/assignment-preview-draft";

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
 * Resolver khớp công thức `StudentPreviewPaper`: `skill ?? "writing"`
 * (skill KHÔNG fallback task/genre), `part ?? task`, `type ?? genre`; type
 * rỗng/không nhận diện resolve qua preset fallback (`typeOf`) — cùng resolver
 * hiển thị preset ở tab "Đề bài", tránh `answerKindByType[""]` undefined làm
 * câu mcq render thành cloze tự do và chấm sai so với key letter.
 */
export function buildQuizSim(
	draft: PreviewDraft,
	simKey: string = draftSimKey(draft),
): QuizSimulation | null {
	const skillId = draft.skill ?? "writing";
	if (skillId !== "reading" && skillId !== "listening") return null;
	const partId = draft.part ?? draft.task ?? "task2";
	const typeId = typeOf(
		skillId,
		partId,
		draft.type ?? draft.genre ?? "discuss",
	).id;
	// Normalize mirror tinh thần `parseQuizQuestions` (server): default
	// `alts`/`answer` rỗng, bỏ item thiếu stem — không để TypeError trong
	// `gradeQuiz` khi giáo viên bấm "Nộp bài" với items legacy malformed.
	const fullQuestions = (draft.items ?? [])
		.filter((item) => typeof item.stem === "string" && item.stem.trim() !== "")
		.map(normalizeQuestion);
	if (fullQuestions.length === 0) return null;
	const takeQuestions: StudentQuizQuestion[] = fullQuestions.map(
		(question) => ({
			stem: question.stem,
			opts: question.opts,
			pin: question.pin ?? null,
		}),
	);
	const detail: QuizPaperDetail = {
		skill: skillId,
		type: typeId,
		band: draft.band,
		intro: draft.intro ?? "",
		prompt: draft.prompt,
		passage: draft.passage ?? "",
		transcript: draft.transcript ?? "",
		cueTopic: draft.cueTopic ?? "",
		cuePoints: draft.cuePoints ?? "",
		audioName: draft.audioName ?? "",
		imageUrl: draft.imageUrl ?? "",
		optionBank: draft.optionBank ?? [],
	};
	return { detail, takeQuestions, fullQuestions, note: draft.note, simKey };
}

/** Item soạn/draft có thể thiếu field ở runtime (JSON cũ) — ép về contract. */
function normalizeQuestion(item: QuestionItem): AssignmentQuestion {
	return {
		stem: item.stem,
		opts: Array.isArray(item.opts) ? item.opts : null,
		answer: typeof item.answer === "string" ? item.answer : "",
		alts: typeof item.alts === "string" ? item.alts : "",
		pin: item.pin ?? null,
	};
}
