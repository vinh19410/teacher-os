/**
 * Pure objective scoring & text normalization helpers for the 5-skill placement test.
 * Mirrors packages/api/src/placement-test-contracts.ts so client preview matches server grading.
 */

export const LEAD_PLACEMENT_MAX = 300;

const INLINE_CEFR_TAG_RE =
	/\s*[([][\s]*(?:(?:level|cefr)\s+)?(?:pre-a1|a1|a2\+?|b1\+?|b2\+?|c1|c2)(?:\s*(?:[–—/-]|to)\s*(?:pre-a1|a1|a2\+?|b1\+?|b2\+?|c1|c2))?[\s]*[)\]]/gi;

/**
 * Strips inline parenthesized/bracketed CEFR level annotations (e.g. "(A2)", "[B1–B2]", "(Level A2+)")
 * from student-facing clip or passage titles without altering normal text.
 */
export function stripInlineCefrLabel(rawTitle) {
	return String(rawTitle ?? "")
		.replace(INLINE_CEFR_TAG_RE, " ")
		.replace(/\s{2,}/g, " ")
		.replace(/\s+([,:;!?])/g, "$1")
		.trim();
}

export const PLACEMENT_LEVEL_ORDER = [
	"Pre-A1",
	"A1",
	"A2",
	"A2+",
	"B1",
	"B2",
	"B2+",
	"C1",
	"C2",
];

const FALLBACK_BAND = {
	min: 0,
	max: 100,
	cefr: "A1",
	course: "comm-1",
	courseLabel: "Giao tiếp 1",
	displayCourse: "Giao tiếp 1",
	advice: "",
};

/**
 * Normalizes a listening gap-fill answer for exact comparison.
 * Strips time/currency markers ("p.m.", "$", "dollars", "o'clock") and non-alphanumeric chars.
 */
export function normalizeGapAnswer(raw) {
	return String(raw ?? "")
		.toLowerCase()
		.replace(/p\.?m\.?|\$|dollars?|o'clock/g, "")
		.replace(/[^a-z0-9]/g, "");
}

/**
 * Counts whitespace-delimited words in Writing text.
 */
export function countWords(text) {
	const trimmed = String(text ?? "").trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Matches a percentage score (0..100) to a placement band using raw float thresholds (`>= min`),
 * matching `bandOf(total)` in raw-data/placement-test-audio.html.
 */
export function matchBandByPct(pct, bands) {
	const list = Array.isArray(bands) ? bands : [];
	if (list.length === 0) {
		return { ...FALLBACK_BAND };
	}
	const safePct = Number.isFinite(pct) ? pct : 0;
	const sorted = [...list].sort((a, b) => a.min - b.min);
	let matched = sorted[0];
	for (const band of sorted) {
		if (safePct >= band.min) {
			matched = band;
		}
	}
	return matched;
}

function createSectionScore(correct, total) {
	return {
		correct,
		total,
		pct: total > 0 ? Math.round((correct / total) * 100) : null,
	};
}

function recordLevelStat(levelMap, level, isCorrect) {
	const key = String(level || "A1");
	const current = levelMap.get(key) ?? { correct: 0, total: 0 };
	current.total += 1;
	if (isCorrect) current.correct += 1;
	levelMap.set(key, current);
}

function isCorrectChoiceIndex(selected, expected) {
	return (
		typeof selected === "number" &&
		Number.isInteger(selected) &&
		selected === expected
	);
}

function resolveSnapshotParts(snapshot) {
	const parts = Array.isArray(snapshot?.parts) ? snapshot.parts : [];
	const listening = parts.find((part) => part?.id === "listening") ??
		parts[0] ?? { clips: [] };
	const vocabGrammar = parts.find((part) => part?.id === "vocab-grammar") ??
		parts[1] ?? { questions: [] };
	const reading = parts.find((part) => part?.id === "reading") ??
		parts[2] ?? { passages: [] };
	const writing =
		parts.find((part) => part?.id === "writing") ?? parts[3] ?? null;
	const speaking =
		parts.find((part) => part?.id === "speaking") ?? parts[4] ?? null;
	return { listening, vocabGrammar, reading, writing, speaking };
}

/**
 * Scores the 3 objective parts of a 5-skill PlacementSnapshot (listening, vocab-grammar, reading).
 */
export function scoreObjectiveTest(snapshot, answers = {}) {
	const { listening, vocabGrammar, reading } = resolveSnapshotParts(snapshot);
	const listeningAnswers = answers?.listening ?? {};
	const vocabGrammarAnswers = answers?.vocabGrammar ?? {};
	const readingAnswers = answers?.reading ?? {};

	const levelMap = new Map();

	let listeningCorrect = 0;
	let listeningTotal = 0;
	for (const clip of listening?.clips ?? []) {
		for (const q of clip?.questions ?? []) {
			listeningTotal += 1;
			const rawAns = listeningAnswers[q.id];
			let ok = false;
			if (q.type === "gap") {
				const normalizedUser = normalizeGapAnswer(
					typeof rawAns === "string" ? rawAns : "",
				);
				ok =
					normalizedUser.length > 0 &&
					(q.accept ?? []).some(
						(accepted) => normalizeGapAnswer(accepted) === normalizedUser,
					);
			} else {
				ok = isCorrectChoiceIndex(rawAns, q.answer);
			}
			if (ok) listeningCorrect += 1;
			recordLevelStat(levelMap, q.level, ok);
		}
	}

	let vgCorrect = 0;
	let vgTotal = 0;
	for (const q of vocabGrammar?.questions ?? []) {
		vgTotal += 1;
		const ok = isCorrectChoiceIndex(vocabGrammarAnswers[q.id], q.answer);
		if (ok) vgCorrect += 1;
		recordLevelStat(levelMap, q.level, ok);
	}

	let readingCorrect = 0;
	let readingTotal = 0;
	for (const passage of reading?.passages ?? []) {
		for (const q of passage?.questions ?? []) {
			readingTotal += 1;
			const ok = isCorrectChoiceIndex(readingAnswers[q.id], q.answer);
			if (ok) readingCorrect += 1;
			recordLevelStat(levelMap, q.level, ok);
		}
	}

	const listeningScore = createSectionScore(listeningCorrect, listeningTotal);
	const vocabGrammarScore = createSectionScore(vgCorrect, vgTotal);
	const readingScore = createSectionScore(readingCorrect, readingTotal);

	const listeningExactPct =
		listeningTotal > 0 ? (listeningCorrect / listeningTotal) * 100 : null;
	const vgExactPct = vgTotal > 0 ? (vgCorrect / vgTotal) * 100 : null;
	const readingExactPct =
		readingTotal > 0 ? (readingCorrect / readingTotal) * 100 : null;

	const sectionExactPcts = [
		listeningExactPct,
		vgExactPct,
		readingExactPct,
	].filter((pct) => pct !== null);

	const exactAveragePct =
		sectionExactPcts.length > 0
			? sectionExactPcts.reduce((sum, pct) => sum + pct, 0) /
				sectionExactPcts.length
			: 0;
	const averagePct = Math.round(exactAveragePct);

	const orderedLevels = [
		...PLACEMENT_LEVEL_ORDER.filter((lvl) => levelMap.has(lvl)),
		...[...levelMap.keys()].filter(
			(lvl) => !PLACEMENT_LEVEL_ORDER.includes(lvl),
		),
	];

	const byLevel = orderedLevels.map((level) => {
		const stats = levelMap.get(level);
		return {
			level,
			correct: stats.correct,
			total: stats.total,
			pct:
				stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
		};
	});

	const provisionalBand = matchBandByPct(exactAveragePct, snapshot?.bands);

	return {
		listening: {
			...listeningScore,
			band:
				listeningExactPct !== null
					? matchBandByPct(listeningExactPct, snapshot?.bands)
					: null,
		},
		vocabGrammar: vocabGrammarScore,
		reading: {
			...readingScore,
			band:
				readingExactPct !== null
					? matchBandByPct(readingExactPct, snapshot?.bands)
					: null,
		},
		totalCorrect: listeningCorrect + vgCorrect + readingCorrect,
		totalQuestions: listeningTotal + vgTotal + readingTotal,
		averagePct,
		byLevel,
		provisionalBand,
	};
}

/**
 * Formats a concise provisional summary within LEAD_PLACEMENT_MAX chars for lead persistence.
 */
export function buildProvisionalSummary(objective) {
	const band = objective?.provisionalBand ?? FALLBACK_BAND;
	const summary = `Tạm tính ${band.cefr} (${objective?.averagePct ?? 0}%) • Nghe ${objective?.listening?.correct ?? 0}/${objective?.listening?.total ?? 0}, NP-TV ${objective?.vocabGrammar?.correct ?? 0}/${objective?.vocabGrammar?.total ?? 0}, Đọc ${objective?.reading?.correct ?? 0}/${objective?.reading?.total ?? 0}`;
	if (summary.length <= LEAD_PLACEMENT_MAX) return summary;
	return `${summary.slice(0, LEAD_PLACEMENT_MAX - 1)}…`;
}

/**
 * Counts how many objective questions exist and how many have been answered so far.
 */
export function countObjectiveProgress(snapshot, answers = {}) {
	const { listening, vocabGrammar, reading } = resolveSnapshotParts(snapshot);
	const lAns = answers?.listening ?? {};
	const vgAns = answers?.vocabGrammar ?? {};
	const rAns = answers?.reading ?? {};

	let total = 0;
	let answered = 0;
	const unansweredByPart = {
		listening: 0,
		vocabGrammar: 0,
		reading: 0,
	};

	for (const clip of listening?.clips ?? []) {
		for (const q of clip?.questions ?? []) {
			total += 1;
			const val = lAns[q.id];
			const done =
				q.type === "gap"
					? typeof val === "string" && val.trim().length > 0
					: typeof val === "number" && Number.isInteger(val);
			if (done) answered += 1;
			else unansweredByPart.listening += 1;
		}
	}

	for (const q of vocabGrammar?.questions ?? []) {
		total += 1;
		const val = vgAns[q.id];
		if (typeof val === "number" && Number.isInteger(val)) answered += 1;
		else unansweredByPart.vocabGrammar += 1;
	}

	for (const passage of reading?.passages ?? []) {
		for (const q of passage?.questions ?? []) {
			total += 1;
			const val = rAns[q.id];
			if (typeof val === "number" && Number.isInteger(val)) answered += 1;
			else unansweredByPart.reading += 1;
		}
	}

	return {
		answered,
		total,
		unanswered: total - answered,
		unansweredByPart,
	};
}

/**
 * Resolves defensive UI state for the Reading step.
 */
export function resolveReadingRenderState(reading) {
	const passages = Array.isArray(reading?.passages) ? reading.passages : [];
	if (passages.length > 0) {
		return { hasPassages: true, emptyMessage: "" };
	}
	return {
		hasPassages: false,
		emptyMessage:
			"Phần Reading hiện chưa có bài đọc nào. Bạn có thể chuyển sang bước tiếp theo.",
	};
}

/**
 * Resolves normalized prompt lines, title fallback, and word bounds for Writing.
 */
export function resolveWritingPromptState(writing) {
	const parsedMin = Number(writing?.minWords);
	const minWords =
		Number.isFinite(parsedMin) && parsedMin > 0 ? Math.floor(parsedMin) : 50;
	const parsedMax = Number(writing?.maxWords);
	const rawMaxWords =
		Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : 80;
	const maxWords = Math.max(minWords, rawMaxWords);
	const promptTitle =
		String(writing?.promptTitle ?? "").trim() || "Bài viết ngắn";
	const rawLines = String(writing?.promptBody ?? "").split("\n");
	const lines = rawLines.filter((line) => line.trim().length > 0);
	if (lines.length === 0) {
		return {
			promptTitle,
			lines: [
				"Hãy viết một đoạn văn ngắn bằng tiếng Anh để giới thiệu bản thân, công việc hoặc sở thích của bạn trong đời sống hằng ngày.",
			],
			minWords,
			maxWords,
			isFallback: true,
		};
	}
	return {
		promptTitle,
		lines,
		minWords,
		maxWords,
		isFallback: false,
	};
}

/**
 * Resolves defensive UI state for the Speaking step.
 */
export function resolveSpeakingStepState(speaking) {
	const tasks = Array.isArray(speaking?.tasks) ? speaking.tasks : [];
	if (tasks.length > 0) {
		return { hasTasks: true, emptyMessage: "" };
	}
	return {
		hasTasks: false,
		emptyMessage:
			"Đề kiểm tra hiện không có câu hỏi Speaking. Bạn có thể nộp bài ngay bên dưới.",
	};
}

/**
 * Determines final speakingMode and whether submit must be blocked for missing Speaking audio.
 * Checks `!hasSpeakingTasks` before `hasValidBlob` so no phantom upload is attempted.
 */
export function resolveSpeakingSubmitDecision({
	hasSpeakingTasks,
	hasValidBlob,
}) {
	if (!hasSpeakingTasks) {
		return {
			finalMode: "none",
			needsSpeakingDecision: false,
			blockedByMissingSpeaking: false,
		};
	}
	if (hasValidBlob) {
		return {
			finalMode: "upload",
			needsSpeakingDecision: false,
			blockedByMissingSpeaking: false,
		};
	}
	return {
		finalMode: null,
		needsSpeakingDecision: false,
		blockedByMissingSpeaking: true,
	};
}

/**
 * Resolves student-facing label and badge class for all Speaking submission statuses.
 */
export function resolveSpeakingStatusDisplay(speakingStatus) {
	if (speakingStatus === "uploaded") {
		return {
			label: "Đã gửi file ghi âm · Chờ cô chấm",
			badgeClass: "is-ok",
		};
	}
	if (speakingStatus === "pending_upload") {
		return {
			label: "Bài đã nộp, file Speaking chưa tải lên được",
			badgeClass: "is-warn",
		};
	}
	if (speakingStatus === "none") {
		return {
			label: "Không áp dụng (đề không có phần Speaking)",
			badgeClass: "is-muted",
		};
	}
	return {
		label: "Đã bỏ qua phần Speaking",
		badgeClass: "is-muted",
	};
}

/**
 * Counts the total number of Reading questions in a placement test snapshot.
 */
export function countReadingQuestions(snapshot) {
	const readingPart =
		snapshot?.reading ?? resolveSnapshotParts(snapshot).reading ?? {};
	const passages = Array.isArray(readingPart?.passages)
		? readingPart.passages
		: [];
	let total = 0;
	for (const passage of passages) {
		total += Array.isArray(passage?.questions) ? passage.questions.length : 0;
	}
	return total;
}

/**
 * Redirects restored localStorage attempts from Writing/Speaking back to Reading
 * when a backfilled snapshot now contains Reading questions with zero valid answers
 * and the attempt had not already seen Reading questions (`knownReadingCount`).
 */
export function resolveRestoredAttemptStep(
	step,
	snapshot,
	answers = {},
	knownReadingCount = null,
) {
	if (step !== "writing" && step !== "speaking") {
		return { step, redirectedToReading: false };
	}
	if (typeof knownReadingCount === "number" && knownReadingCount > 0) {
		return { step, redirectedToReading: false };
	}

	const readingPart =
		snapshot?.reading ?? resolveSnapshotParts(snapshot).reading ?? {};
	const passages = Array.isArray(readingPart?.passages)
		? readingPart.passages
		: [];
	const readingAnswers = answers?.reading ?? {};

	let totalReadingQuestions = 0;
	let answeredReadingQuestions = 0;

	for (const passage of passages) {
		for (const q of passage?.questions ?? []) {
			totalReadingQuestions += 1;
			const val = readingAnswers[q.id];
			if (
				typeof val === "number" &&
				Number.isInteger(val) &&
				val >= 0 &&
				val <= 3
			) {
				answeredReadingQuestions += 1;
			}
		}
	}

	if (totalReadingQuestions > 0 && answeredReadingQuestions === 0) {
		return { step: "reading", redirectedToReading: true };
	}
	return { step, redirectedToReading: false };
}

function clampSpeakingInt(rawValue, min, max, fallback) {
	const num = Number(rawValue);
	if (!Number.isFinite(num)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(num)));
}

/**
 * Resolves bounded prep and answer durations (seconds) for a Speaking task.
 */
export function resolveTaskTimings(task) {
	return {
		prepSeconds: clampSpeakingInt(task?.prepSeconds, 0, 120, 15),
		answerSeconds: clampSpeakingInt(task?.answerSeconds, 5, 180, 45),
	};
}

/**
 * Computes a bounded safety timeout (ms) when reading a Speaking prompt aloud
 * so headless browsers or silent TTS never hang the reading phase.
 */
export function computeSpeechFallbackTimeoutMs(prompt) {
	const text = String(prompt ?? "").trim();
	const wordCount = text ? text.split(/\s+/).length : 0;
	return Math.min(25000, Math.max(4000, wordCount * 550 + 2500));
}

export const MAX_SPEAKING_RETRIES_PER_TASK = 2;

/**
 * Creates the initial idle state for sequential Speaking turn-taking.
 */
export function createInitialSpeakingSession(totalTasks = 0) {
	return {
		status: "idle",
		taskIndex: 0,
		totalTasks: Math.max(0, Math.trunc(Number(totalTasks) || 0)),
		phase: "idle",
		secondsLeft: 0,
		replayUsedForCurrentTask: false,
		retriesUsedForCurrentTask: 0,
	};
}

/**
 * Enters the `reading` phase for the given task index and resets per-task replay & retry quotas.
 */
export function startSpeakingTaskReading(session, taskIndex, tasks = []) {
	if (!Array.isArray(tasks) || tasks.length === 0) {
		return {
			...createInitialSpeakingSession(0),
			status: "completed",
			phase: "done",
		};
	}
	const safeIndex = Math.max(
		0,
		Math.min(tasks.length - 1, Math.trunc(Number(taskIndex) || 0)),
	);
	return {
		...session,
		status: "active",
		taskIndex: safeIndex,
		totalTasks: tasks.length,
		phase: "reading",
		secondsLeft: 0,
		replayUsedForCurrentTask: false,
		retriesUsedForCurrentTask: 0,
	};
}

/**
 * Advances from `reading` into `prep` (if prepSeconds > 0) or directly `answer`.
 */
export function transitionSpeakingAfterReading(session, tasks = []) {
	const task = Array.isArray(tasks) ? tasks[session?.taskIndex ?? 0] : null;
	if (!task) {
		return {
			...session,
			status: "completed",
			phase: "done",
			secondsLeft: 0,
		};
	}
	const { prepSeconds, answerSeconds } = resolveTaskTimings(task);
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

/**
 * Skips remaining `prep` countdown and immediately starts the `answer` phase.
 */
export function transitionSpeakingToAnswer(session, tasks = []) {
	const task = Array.isArray(tasks) ? tasks[session?.taskIndex ?? 0] : null;
	if (!task) {
		return {
			...session,
			status: "completed",
			phase: "done",
			secondsLeft: 0,
		};
	}
	const { answerSeconds } = resolveTaskTimings(task);
	return {
		...session,
		status: "active",
		phase: "answer",
		secondsLeft: answerSeconds,
	};
}

/**
 * Transitions from the `answer` phase to `paused` after stopping the task's recorder.
 */
export function transitionSpeakingToPaused(session) {
	if (session?.status !== "active" || session?.phase !== "answer") {
		return session;
	}
	return {
		...session,
		phase: "paused",
		secondsLeft: 0,
	};
}

/**
 * Allows at most MAX_SPEAKING_RETRIES_PER_TASK retries while in the `paused` phase.
 */
export function canRetrySpeakingTask(session) {
	return Boolean(
		session &&
			session.status === "active" &&
			session.phase === "paused" &&
			(session.retriesUsedForCurrentTask ?? 0) < MAX_SPEAKING_RETRIES_PER_TASK,
	);
}

/**
 * Re-enters `answer` phase for the current task when retries remain, incrementing retry count.
 */
export function retrySpeakingCurrentTask(session, tasks = []) {
	if (!canRetrySpeakingTask(session)) {
		return session;
	}
	const task = Array.isArray(tasks) ? tasks[session?.taskIndex ?? 0] : null;
	if (!task) {
		return {
			...session,
			status: "completed",
			phase: "done",
			secondsLeft: 0,
		};
	}
	const { answerSeconds } = resolveTaskTimings(task);
	return {
		...session,
		status: "active",
		phase: "answer",
		secondsLeft: answerSeconds,
		retriesUsedForCurrentTask: (session.retriesUsedForCurrentTask ?? 0) + 1,
	};
}

/**
 * Advances from the current task's `answer` or `paused` phase to the next task's
 * `reading` phase, or completes the session after the final task.
 */
export function transitionSpeakingNextTask(session, tasks = []) {
	if (
		session?.status !== "active" ||
		(session.phase !== "answer" && session.phase !== "paused")
	) {
		return session;
	}
	const list = Array.isArray(tasks) ? tasks : [];
	const nextIndex = (session?.taskIndex ?? 0) + 1;
	if (nextIndex < list.length) {
		return startSpeakingTaskReading(session, nextIndex, list);
	}
	return {
		...session,
		status: "completed",
		phase: "done",
		secondsLeft: 0,
		replayUsedForCurrentTask: false,
		retriesUsedForCurrentTask: 0,
	};
}

/**
 * Allows at most one prompt replay during the `prep` phase of each Speaking task.
 */
export function canReplaySpeakingPrompt(session) {
	return Boolean(
		session &&
			session.status === "active" &&
			session.phase === "prep" &&
			!session.replayUsedForCurrentTask,
	);
}

const BANNED_IMAGE_FTYP_BRANDS = new Set([
	"heic",
	"heix",
	"hevc",
	"hevx",
	"mif1",
	"msf1",
	"avif",
	"avis",
	"jp2 ",
]);

const IN_APP_BROWSER_RE =
	/zalo|fban|fbav|fb_iab|messenger|instagram|line\/|bytedancewebview|musical_ly|tiktok/i;

function toUint8Array(input) {
	if (!input) return null;
	if (input instanceof Uint8Array) return input;
	if (input instanceof ArrayBuffer) return new Uint8Array(input);
	if (ArrayBuffer.isView(input)) {
		return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
	}
	return null;
}

function hasBytesAt(buf, offset, expected) {
	if (buf.byteLength < offset + expected.length) return false;
	for (let i = 0; i < expected.length; i += 1) {
		if (buf[offset + i] !== expected[i]) return false;
	}
	return true;
}

function readFourCcAlnumSpace(buf, offset) {
	if (buf.byteLength < offset + 4) return null;
	let out = "";
	for (let i = 0; i < 4; i += 1) {
		const b = buf[offset + i] ?? 0;
		const valid =
			b === 0x20 ||
			(b >= 0x30 && b <= 0x39) ||
			(b >= 0x41 && b <= 0x5a) ||
			(b >= 0x61 && b <= 0x7a);
		if (!valid) return null;
		out += String.fromCharCode(b);
	}
	return out;
}

/**
 * Inspects leading bytes of recorded speaking audio to identify its canonical
 * MIME type, matching the server's magic-byte signatures.
 */
export function detectSpeakingAudioMimeFromBytes(headBytes) {
	const bytes = toUint8Array(headBytes);
	if (!bytes || bytes.byteLength < 3) return null;

	// WAV: RIFF....WAVE or RF64....WAVE
	if (
		bytes.byteLength >= 12 &&
		(hasBytesAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) ||
			hasBytesAt(bytes, 0, [0x52, 0x46, 0x36, 0x34])) &&
		hasBytesAt(bytes, 8, [0x57, 0x41, 0x56, 0x45])
	) {
		return "audio/wav";
	}

	// ISO BMFF / MP4 / M4A: ....ftyp with non-image 4CC major brand at offset 8 or 16
	if (
		bytes.byteLength >= 16 &&
		hasBytesAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])
	) {
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const rawSize = view.getUint32(0, false);
		const brandOffset = rawSize === 1 ? 16 : 8;
		const brand = readFourCcAlnumSpace(bytes, brandOffset);
		if (brand !== null && !BANNED_IMAGE_FTYP_BRANDS.has(brand)) {
			return "audio/mp4";
		}
		return null;
	}

	// WebM / Matroska EBML header
	if (hasBytesAt(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
		return "audio/webm";
	}

	// Ogg container ("OggS")
	if (hasBytesAt(bytes, 0, [0x4f, 0x67, 0x67, 0x53])) {
		return "audio/ogg";
	}

	// MP3: ID3v2 header or MPEG Audio Layer 3 frame sync
	if (hasBytesAt(bytes, 0, [0x49, 0x44, 0x33])) {
		return "audio/mpeg";
	}
	const b0 = bytes[0];
	const b1 = bytes[1];
	const b2 = bytes[2];
	if (
		b0 === 0xff &&
		(b1 & 0xe0) === 0xe0 &&
		(b1 & 0x18) !== 0x08 &&
		(b1 & 0x06) === 0x02 &&
		(b2 & 0xf0) !== 0x00 &&
		(b2 & 0xf0) !== 0xf0 &&
		(b2 & 0x0c) !== 0x0c
	) {
		return "audio/mpeg";
	}

	// AAC: ADTS frame sync
	if (b0 === 0xff && (b1 & 0xf6) === 0xf0 && ((b2 >> 2) & 0x0f) < 13) {
		return "audio/aac";
	}

	return null;
}

export function resolveSpeakingUploadMeta(blobType, headBytes = null) {
	const detected = headBytes
		? detectSpeakingAudioMimeFromBytes(headBytes)
		: null;
	const base =
		detected ||
		String(blobType ?? "")
			.split(";")[0]
			.trim()
			.toLowerCase();
	switch (base) {
		case "video/webm":
		case "audio/webm":
			return { contentType: "audio/webm", filename: "speaking.webm" };
		case "audio/mp4":
		case "video/mp4":
		case "audio/x-m4a":
		case "audio/m4a":
		case "audio/mp4a-latm":
			return { contentType: "audio/mp4", filename: "speaking.m4a" };
		case "audio/ogg":
		case "audio/opus":
		case "audio/x-opus+ogg":
		case "audio/x-vorbis+ogg":
		case "video/ogg":
		case "application/ogg":
			return { contentType: "audio/ogg", filename: "speaking.ogg" };
		case "audio/mpeg":
		case "audio/mp3":
		case "audio/x-mp3":
		case "audio/x-mpeg":
		case "audio/mpeg3":
		case "audio/x-mpeg-3":
			return { contentType: "audio/mpeg", filename: "speaking.mp3" };
		case "audio/wav":
		case "audio/x-wav":
		case "audio/wave":
		case "audio/vnd.wave":
			return { contentType: "audio/wav", filename: "speaking.wav" };
		case "audio/aac":
		case "audio/x-aac":
		case "audio/aacp":
		case "audio/vnd.dlna.adts":
		case "audio/adts":
		case "audio/x-hx-aac-adts":
			return { contentType: "audio/aac", filename: "speaking.aac" };
		default:
			return { contentType: "audio/webm", filename: "speaking.webm" };
	}
}

/**
 * Detects common mobile in-app WebViews where microphone or MediaRecorder
 * access frequently fails compared to Safari or Chrome.
 */
export function isLikelyInAppBrowser(userAgent = "") {
	return IN_APP_BROWSER_RE.test(String(userAgent ?? ""));
}

/**
 * Classifies whether a Speaking media upload failure is transient and safe to
 * retry automatically (network error / timeout / rate limit / 5xx).
 */
export function isRetryableSpeakingUploadError(status) {
	if (status === 0 || status === null || status === undefined) {
		return true;
	}
	const code = Number(status);
	if (!Number.isFinite(code)) {
		return true;
	}
	return code === 0 || code === 408 || code === 429 || code >= 500;
}

export const SPEAKING_RECORDER_MIME_CANDIDATES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/ogg;codecs=opus",
	"audio/ogg",
];

/** Audio-only: never returns a video/* type. Empty string = let the browser choose. */
export function pickSupportedRecorderMime(MediaRecorderImpl) {
	if (typeof MediaRecorderImpl === "undefined" || !MediaRecorderImpl) return "";
	if (typeof MediaRecorderImpl.isTypeSupported !== "function") {
		return "";
	}
	return (
		SPEAKING_RECORDER_MIME_CANDIDATES.find((mime) =>
			MediaRecorderImpl.isTypeSupported(mime),
		) ?? ""
	);
}
