/**
 * Pure objective scoring & text normalization helpers for the 5-skill placement test.
 * Mirrors packages/api/src/placement-test-contracts.ts so client preview matches server grading.
 */

export const LEAD_PLACEMENT_MAX = 300;

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
 * Matches a percentage score (0..100) to a placement band.
 */
export function matchBandByPct(pct, bands) {
	const list = Array.isArray(bands) ? bands : [];
	if (list.length === 0) {
		return { ...FALLBACK_BAND };
	}
	const rounded = Math.round(Number.isFinite(pct) ? pct : 0);
	const sorted = [...list].sort((a, b) => a.min - b.min);
	const matched = sorted.find(
		(band) => rounded >= band.min && rounded <= band.max,
	);
	if (matched) return matched;
	return rounded < sorted[0].min ? sorted[0] : sorted[sorted.length - 1];
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

	const sectionPcts = [
		listeningScore.pct,
		vocabGrammarScore.pct,
		readingScore.pct,
	].filter((pct) => pct !== null);

	const averagePct =
		sectionPcts.length > 0
			? Math.round(
					sectionPcts.reduce((sum, pct) => sum + pct, 0) / sectionPcts.length,
				)
			: 0;

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

	const provisionalBand = matchBandByPct(averagePct, snapshot?.bands);

	return {
		listening: listeningScore,
		vocabGrammar: vocabGrammarScore,
		reading: readingScore,
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
