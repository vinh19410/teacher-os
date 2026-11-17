import { LEAD_COURSE_LABELS } from "@teacher-os/api/lead-contracts";
import {
	locatePlacementErrors,
	PLACEMENT_ERROR_CATEGORIES,
	type PlacementError,
	type PlacementErrorCategory,
	type PlacementPublishedBand,
	type PlacementPublishedSpeakingTask,
	type PlacementReadingPassageKind,
	type PlacementSnapshot,
	type StudentPlacementSubmit,
	stripInlineCefrLabel,
} from "@teacher-os/api/placement-test-contracts";

export const PLACEMENT_RECOMMENDED_TIMER_SECONDS = 40 * 60;
export const PLACEMENT_SPEAKING_MAX_BYTES = 50 * 1024 * 1024;
export const PLACEMENT_OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export type PlacementRunnerStep =
	| "intro"
	| "listening"
	| "vocab-grammar"
	| "reading"
	| "writing"
	| "speaking";

export const PLACEMENT_SKILL_STEPS: ReadonlyArray<{
	id: Exclude<PlacementRunnerStep, "intro">;
	shortLabel: string;
	title: string;
}> = [
	{ id: "listening", shortLabel: "1. Listening", title: "Phần 1 · Listening" },
	{
		id: "vocab-grammar",
		shortLabel: "2. Grammar & Vocab",
		title: "Phần 2 · Grammar & Vocabulary",
	},
	{ id: "reading", shortLabel: "3. Reading", title: "Phần 3 · Reading" },
	{ id: "writing", shortLabel: "4. Writing", title: "Phần 4 · Writing" },
	{ id: "speaking", shortLabel: "5. Speaking", title: "Phần 5 · Speaking" },
];

export const PLACEMENT_TIMED_STEPS = new Set<PlacementRunnerStep>([
	"listening",
	"vocab-grammar",
	"reading",
	"writing",
]);

export const PLACEMENT_READING_KIND_LABELS: Record<
	PlacementReadingPassageKind,
	string
> = {
	sign: "Biển báo / Thông báo",
	message: "Tin nhắn / Email",
	passage: "Bài đọc hiểu",
	cloze: "Đoạn văn điền từ",
};

export interface PlacementDraftAnswers {
	listening: Record<string, string | number | null>;
	vocabGrammar: Record<string, number | null>;
	reading: Record<string, number | null>;
}

export interface PlacementDraftState {
	step: PlacementRunnerStep;
	answers: PlacementDraftAnswers;
	plays: Record<string, number>;
	writingText: string;
	speakingMode: "none" | "skipped";
	timerStartedAt: number | null;
}

export function createInitialPlacementDraft(): PlacementDraftState {
	return {
		step: "intro",
		answers: {
			listening: {},
			vocabGrammar: {},
			reading: {},
		},
		plays: {},
		writingText: "",
		speakingMode: "none",
		timerStartedAt: null,
	};
}

export function getPlacementDraftStorageKey(
	studentId: string,
	testVersion: number,
): string {
	return `msmy_student_placement_v1:${studentId}:${testVersion}`;
}

const VALID_STEPS = new Set<PlacementRunnerStep>([
	"intro",
	"listening",
	"vocab-grammar",
	"reading",
	"writing",
	"speaking",
]);

function sanitizeRecord<T>(
	raw: unknown,
	isValid: (v: unknown) => v is T,
): Record<string, T> {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
	const out: Record<string, T> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (isValid(v)) out[k] = v;
	}
	return out;
}

export function loadPlacementDraft(
	studentId: string,
	testVersion: number,
): PlacementDraftState {
	const base = createInitialPlacementDraft();
	if (typeof window === "undefined") return base;
	try {
		const raw = window.localStorage.getItem(
			getPlacementDraftStorageKey(studentId, testVersion),
		);
		if (!raw) return base;
		const parsed = JSON.parse(raw) as Record<string, unknown> | null;
		if (!parsed || typeof parsed !== "object") return base;

		const rawStep = parsed.step;
		const step: PlacementRunnerStep =
			typeof rawStep === "string" &&
			VALID_STEPS.has(rawStep as PlacementRunnerStep)
				? (rawStep as PlacementRunnerStep)
				: "intro";

		const rawAnswers =
			parsed.answers && typeof parsed.answers === "object"
				? (parsed.answers as Record<string, unknown>)
				: {};

		const listening = sanitizeRecord<string | number | null>(
			rawAnswers.listening,
			(v): v is string | number | null =>
				v === null ||
				typeof v === "string" ||
				(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3),
		);
		const vocabGrammar = sanitizeRecord<number | null>(
			rawAnswers.vocabGrammar,
			(v): v is number | null =>
				v === null ||
				(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3),
		);
		const reading = sanitizeRecord<number | null>(
			rawAnswers.reading,
			(v): v is number | null =>
				v === null ||
				(typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 3),
		);
		const plays = sanitizeRecord<number>(
			parsed.plays,
			(v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0,
		);

		return {
			step,
			answers: { listening, vocabGrammar, reading },
			plays,
			writingText:
				typeof parsed.writingText === "string" ? parsed.writingText : "",
			speakingMode: parsed.speakingMode === "skipped" ? "skipped" : "none",
			timerStartedAt:
				typeof parsed.timerStartedAt === "number" &&
				Number.isFinite(parsed.timerStartedAt)
					? parsed.timerStartedAt
					: null,
		};
	} catch {
		return base;
	}
}

export function savePlacementDraft(
	studentId: string,
	testVersion: number,
	draft: PlacementDraftState,
): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			getPlacementDraftStorageKey(studentId, testVersion),
			JSON.stringify(draft),
		);
	} catch {
		// Ignore localStorage quota/privacy errors
	}
}

export function clearPlacementDraft(
	studentId: string,
	testVersion: number,
): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.removeItem(
			getPlacementDraftStorageKey(studentId, testVersion),
		);
	} catch {
		// Ignore localStorage errors
	}
}

export function buildQuestionNumberMap(
	snapshot: PlacementSnapshot,
): Map<string, number> {
	const map = new Map<string, number>();
	let index = 1;
	const listening = snapshot.parts[0];
	const vg = snapshot.parts[1];
	const reading = snapshot.parts[2];
	for (const clip of listening.clips) {
		for (const q of clip.questions) {
			map.set(q.id, index++);
		}
	}
	for (const q of vg.questions) {
		map.set(q.id, index++);
	}
	for (const passage of reading.passages) {
		for (const q of passage.questions) {
			map.set(q.id, index++);
		}
	}
	return map;
}

export function countObjectiveProgress(
	snapshot: PlacementSnapshot,
	answers: PlacementDraftAnswers,
): { answered: number; total: number; unanswered: number } {
	let total = 0;
	let answered = 0;

	for (const clip of snapshot.parts[0].clips) {
		for (const q of clip.questions) {
			total += 1;
			const val = answers.listening[q.id];
			const done =
				q.type === "gap"
					? typeof val === "string" && val.trim().length > 0
					: typeof val === "number" && Number.isInteger(val);
			if (done) answered += 1;
		}
	}

	for (const q of snapshot.parts[1].questions) {
		total += 1;
		const val = answers.vocabGrammar[q.id];
		if (typeof val === "number" && Number.isInteger(val)) answered += 1;
	}

	for (const passage of snapshot.parts[2].passages) {
		for (const q of passage.questions) {
			total += 1;
			const val = answers.reading[q.id];
			if (typeof val === "number" && Number.isInteger(val)) answered += 1;
		}
	}

	return { answered, total, unanswered: total - answered };
}

export function sanitizeSubmissionAnswers(
	snapshot: PlacementSnapshot,
	answers: PlacementDraftAnswers,
): StudentPlacementSubmit["answers"] {
	const listening: Record<string, string | number | null> = {};
	for (const clip of snapshot.parts[0].clips) {
		for (const q of clip.questions) {
			const val = answers.listening[q.id];
			if (q.type === "gap") {
				listening[q.id] =
					typeof val === "string" ? val.trim().slice(0, 120) : "";
			} else {
				listening[q.id] =
					typeof val === "number" &&
					Number.isInteger(val) &&
					val >= 0 &&
					val <= 3
						? val
						: null;
			}
		}
	}

	const vocabGrammar: Record<string, number | null> = {};
	for (const q of snapshot.parts[1].questions) {
		const val = answers.vocabGrammar[q.id];
		vocabGrammar[q.id] =
			typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 3
				? val
				: null;
	}

	const reading: Record<string, number | null> = {};
	for (const passage of snapshot.parts[2].passages) {
		for (const q of passage.questions) {
			const val = answers.reading[q.id];
			reading[q.id] =
				typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 3
					? val
					: null;
		}
	}

	return { listening, vocabGrammar, reading };
}

export function formatPlacementClock(totalSeconds: number): string {
	const clamped = Math.max(0, Math.floor(Number(totalSeconds) || 0));
	const mins = Math.floor(clamped / 60);
	const secs = clamped % 60;
	return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function resolveSpeakingTaskTimings(
	task: Pick<PlacementPublishedSpeakingTask, "prepSeconds" | "answerSeconds">,
): {
	prepSeconds: number;
	answerSeconds: number;
} {
	const clamp = (raw: number, min: number, max: number, fallback: number) => {
		if (!Number.isFinite(raw)) return fallback;
		return Math.min(max, Math.max(min, Math.trunc(raw)));
	};
	return {
		prepSeconds: clamp(task.prepSeconds, 0, 120, 15),
		answerSeconds: clamp(task.answerSeconds, 5, 180, 45),
	};
}

export function computeSpeechFallbackTimeoutMs(prompt: string): number {
	const text = prompt.trim();
	const wordCount = text ? text.split(/\s+/).length : 0;
	return Math.min(25_000, Math.max(4_000, wordCount * 550 + 2_500));
}

export type SpeakingPhase = "idle" | "reading" | "prep" | "answer" | "done";

export interface SpeakingSessionState {
	status: "idle" | "active" | "completed";
	taskIndex: number;
	totalTasks: number;
	phase: SpeakingPhase;
	secondsLeft: number;
	replayUsedForCurrentTask: boolean;
}

export function createInitialSpeakingSession(
	totalTasks: number,
): SpeakingSessionState {
	return {
		status: "idle",
		taskIndex: 0,
		totalTasks: Math.max(0, Math.trunc(totalTasks)),
		phase: "idle",
		secondsLeft: 0,
		replayUsedForCurrentTask: false,
	};
}

export function startSpeakingTaskReading(
	session: SpeakingSessionState,
	taskIndex: number,
	tasks: readonly PlacementPublishedSpeakingTask[],
): SpeakingSessionState {
	if (tasks.length === 0) {
		return {
			...createInitialSpeakingSession(0),
			status: "completed",
			phase: "done",
		};
	}
	const safeIndex = Math.max(0, Math.min(tasks.length - 1, taskIndex));
	return {
		...session,
		status: "active",
		taskIndex: safeIndex,
		totalTasks: tasks.length,
		phase: "reading",
		secondsLeft: 0,
		replayUsedForCurrentTask: false,
	};
}

export function transitionSpeakingAfterReading(
	session: SpeakingSessionState,
	tasks: readonly PlacementPublishedSpeakingTask[],
): SpeakingSessionState {
	const task = tasks[session.taskIndex];
	if (!task) {
		return {
			...session,
			status: "completed",
			phase: "done",
			secondsLeft: 0,
		};
	}
	const { prepSeconds, answerSeconds } = resolveSpeakingTaskTimings(task);
	if (prepSeconds > 0) {
		return {
			...session,
			status: "active",
			phase: "prep",
			secondsLeft: prepSeconds,
		};
	}
	return {
		...session,
		status: "active",
		phase: "answer",
		secondsLeft: answerSeconds,
	};
}

export function transitionSpeakingToAnswer(
	session: SpeakingSessionState,
	tasks: readonly PlacementPublishedSpeakingTask[],
): SpeakingSessionState {
	const task = tasks[session.taskIndex];
	if (!task) {
		return {
			...session,
			status: "completed",
			phase: "done",
			secondsLeft: 0,
		};
	}
	const { answerSeconds } = resolveSpeakingTaskTimings(task);
	return {
		...session,
		status: "active",
		phase: "answer",
		secondsLeft: answerSeconds,
	};
}

export function transitionSpeakingNextTask(
	session: SpeakingSessionState,
	tasks: readonly PlacementPublishedSpeakingTask[],
): SpeakingSessionState {
	const nextIndex = session.taskIndex + 1;
	if (nextIndex < tasks.length) {
		return startSpeakingTaskReading(session, nextIndex, tasks);
	}
	return {
		...session,
		status: "completed",
		phase: "done",
		secondsLeft: 0,
		replayUsedForCurrentTask: false,
	};
}

export const SPEAKING_RECORDER_MIME_CANDIDATES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/ogg;codecs=opus",
	"audio/ogg",
] as const;

export function pickSupportedRecorderMime(
	MediaRecorderImpl?: typeof MediaRecorder,
): string {
	if (
		!MediaRecorderImpl ||
		typeof MediaRecorderImpl.isTypeSupported !== "function"
	) {
		return "";
	}
	return (
		SPEAKING_RECORDER_MIME_CANDIDATES.find((mime) =>
			MediaRecorderImpl.isTypeSupported(mime),
		) ?? ""
	);
}

export function resolveSpeakingUploadMeta(blobType: string): {
	contentType: string;
	filename: string;
} {
	const base = String(blobType ?? "")
		.split(";")[0]
		?.trim()
		.toLowerCase();
	switch (base) {
		case "video/webm":
		case "audio/webm":
			return { contentType: "audio/webm", filename: "speaking.webm" };
		case "audio/mp4":
			return { contentType: "audio/mp4", filename: "speaking.m4a" };
		case "audio/ogg":
			return { contentType: "audio/ogg", filename: "speaking.ogg" };
		case "audio/mpeg":
		case "audio/mp3":
			return { contentType: "audio/mpeg", filename: "speaking.mp3" };
		case "audio/wav":
		case "audio/x-wav":
			return { contentType: "audio/wav", filename: "speaking.wav" };
		case "audio/aac":
			return { contentType: "audio/aac", filename: "speaking.aac" };
		default:
			return { contentType: "audio/webm", filename: "speaking.webm" };
	}
}

export const PLACEMENT_ERROR_STYLES: Record<
	PlacementErrorCategory,
	{
		label: string;
		lineLabel: string;
		markCls: string;
		swatchCls: string;
	}
> = {
	grammar: {
		label: "Ngữ pháp",
		lineLabel: "gạch liền",
		markCls: "bg-class-5-soft decoration-class-5 decoration-solid",
		swatchCls: "bg-class-5-soft border-class-5 border-solid",
	},
	vocabulary: {
		label: "Từ vựng",
		lineLabel: "gạch đứt",
		markCls: "bg-class-1-soft decoration-class-1 decoration-dashed",
		swatchCls: "bg-class-1-soft border-class-1 border-dashed",
	},
	spelling: {
		label: "Chính tả",
		lineLabel: "gạch sóng",
		markCls: "bg-class-3-soft decoration-class-3 decoration-wavy",
		swatchCls: "bg-class-3-soft border-class-3 border-solid",
	},
	coherence: {
		label: "Mạch lạc",
		lineLabel: "gạch chấm",
		markCls: "bg-class-4-soft decoration-class-4 decoration-dotted",
		swatchCls: "bg-class-4-soft border-class-4 border-dotted",
	},
	pronunciation: {
		label: "Phát âm",
		lineLabel: "gạch đôi",
		markCls: "bg-class-2-soft decoration-class-2 decoration-double",
		swatchCls: "bg-class-2-soft border-class-2 border-double",
	},
};

export const PLACEMENT_ERROR_CATEGORY_LIST = PLACEMENT_ERROR_CATEGORIES;

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

export function circledErrorNumber(n: number): string {
	return n >= 1 && n <= CIRCLED.length
		? (CIRCLED[n - 1] ?? `(${n})`)
		: `(${n})`;
}

export type PlacementHighlightSegment =
	| { kind: "text"; start: number; text: string }
	| {
			kind: "error";
			start: number;
			end: number;
			text: string;
			error: PlacementError;
			number: number;
	  };

export function buildPlacementHighlightSegments(
	text: string,
	errors: readonly PlacementError[],
): { located: PlacementError[]; segments: PlacementHighlightSegment[] } {
	const located = locatePlacementErrors(text, errors);
	const segments: PlacementHighlightSegment[] = [];
	let cursor = 0;
	located.forEach((error, index) => {
		const { start, end } = error;
		if (start === null || end === null) return;
		if (start < cursor || end <= start || end > text.length) return;
		if (start > cursor) {
			segments.push({
				kind: "text",
				start: cursor,
				text: text.slice(cursor, start),
			});
		}
		segments.push({
			kind: "error",
			start,
			end,
			text: text.slice(start, end),
			error,
			number: index + 1,
		});
		cursor = end;
	});
	if (cursor < text.length) {
		segments.push({ kind: "text", start: cursor, text: text.slice(cursor) });
	}
	return { located, segments };
}

export const DEFAULT_PLACEMENT_BANDS: readonly PlacementPublishedBand[] = [
	{
		min: 0,
		max: 29,
		cefr: "Pre-A1",
		course: "foundation-core",
		courseLabel: LEAD_COURSE_LABELS["foundation-core"],
		displayCourse: "Chưa đủ nền cho Level 1",
		advice:
			"Nên học lớp nền tảng / kèm 1-1 khoảng 1–2 tháng (phát âm, câu cơ bản) rồi vào Level 1; hoặc vào Level 1 với hỗ trợ thêm.",
	},
	{
		min: 30,
		max: 54,
		cefr: "A1",
		course: "comm-1",
		courseLabel: LEAD_COURSE_LABELS["comm-1"],
		displayCourse: "Communication English Level 1",
		advice: "Học trọn khoá Level 1 từ Lesson 1.",
	},
	{
		min: 55,
		max: 67,
		cefr: "A2",
		course: "comm-1",
		courseLabel: LEAD_COURSE_LABELS["comm-1"],
		displayCourse: "Communication English Level 1",
		advice:
			"Học Level 1 để chắc nền, tập trung Speaking theo cấu trúc Answer → Reason → Example; tiến nhanh lên Level 2.",
	},
	{
		min: 68,
		max: 84,
		cefr: "A2+ / B1 thấp",
		course: "comm-2",
		courseLabel: LEAD_COURSE_LABELS["comm-2"],
		displayCourse: "Communication English Level 2",
		advice: "Học trọn khoá Level 2 từ Lesson 1.",
	},
	{
		min: 85,
		max: 100,
		cefr: "B1 trở lên",
		course: "comm-3",
		courseLabel: LEAD_COURSE_LABELS["comm-3"],
		displayCourse: "Vượt Level 2",
		advice: "Nên vào lớp B1+/IELTS nền tảng; Level 2 sẽ quá dễ.",
	},
];

export interface PlacementPartGroup<T> {
	partLabel: string;
	instruction: string;
	items: Array<{ item: T; index: number }>;
}

/**
 * Nhóm các mục liên tiếp có cùng `partLabel` (đã lược nhãn CEFR) để chỉ hiển
 * thị tiêu đề Part và `instruction` một lần ở đầu mỗi Part (tách nhóm khi
 * `instruction` thay đổi rõ rệt).
 */
export function groupPlacementItemsByPart<
	T extends { partLabel: string; instruction: string },
>(items: readonly T[]): PlacementPartGroup<T>[] {
	const groups: PlacementPartGroup<T>[] = [];
	items.forEach((item, index) => {
		const partLabel = stripInlineCefrLabel(item.partLabel).trim();
		const instruction = item.instruction.trim();
		const prev = groups[groups.length - 1];
		const canMerge =
			Boolean(partLabel) &&
			Boolean(prev) &&
			prev.partLabel === partLabel &&
			(!instruction || !prev.instruction || prev.instruction === instruction);
		if (canMerge && prev) {
			prev.items.push({ item, index });
			if (!prev.instruction && instruction) {
				prev.instruction = instruction;
			}
		} else {
			groups.push({
				partLabel,
				instruction,
				items: [{ item, index }],
			});
		}
	});
	return groups;
}
