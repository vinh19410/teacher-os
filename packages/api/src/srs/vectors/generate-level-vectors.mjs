#!/usr/bin/env node
/**
 * Flinto review-level test-vector generator.
 *
 * Dependency-free JavaScript reference implementation of docs/srs-spec.md (v2,
 * five memory levels). Generates `level-vectors.json` next to this file. Both
 * native ports (iOS and Android) must reproduce these vectors exactly.
 *
 * Usage:
 *   node generate-level-vectors.mjs           regenerate level-vectors.json
 *   node generate-level-vectors.mjs --check   regenerate in memory and exit 0
 *                                             only if the committed file is
 *                                             byte-identical
 *
 * No dependencies. Node >= 18.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Review rules (keep in sync with docs/srs-spec.md — this is the reference).
// ---------------------------------------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Wait in days after an answer, indexed by `level - 1`. */
export const LEVEL_INTERVAL_DAYS = [1, 3, 7, 14, 30];
/** A flagged level-5 card is re-tested after this many days. */
export const WARNING_INTERVAL_DAYS = 1;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/**
 * Apply the first result of a card in a session.
 * @param {{ level: number, isWarning: boolean, state: 'new'|'review',
 *           intervalDays: number, dueAt: number, lapses: number }} card
 * @param {boolean} correct
 * @param {number} now epoch ms of the answer
 */
export function applyAnswer(card, correct, now) {
	const { level, isWarning } = card;
	let newLevel;
	let newWarning;
	if (correct) {
		newLevel = isWarning ? level - 1 : level + 1;
		newWarning = false;
	} else if (level >= MAX_LEVEL) {
		if (isWarning) {
			newLevel = MIN_LEVEL;
			newWarning = false;
		} else {
			newLevel = MAX_LEVEL;
			newWarning = true;
		}
	} else if (level >= 2) {
		newLevel = level - 1;
		newWarning = false;
	} else {
		newLevel = MIN_LEVEL;
		newWarning = false;
	}
	newLevel = clamp(newLevel, MIN_LEVEL, MAX_LEVEL);
	const intervalDays = newWarning
		? WARNING_INTERVAL_DAYS
		: LEVEL_INTERVAL_DAYS[newLevel - 1];
	return {
		level: newLevel,
		isWarning: newWarning,
		state: "review",
		intervalDays,
		dueAt: now + intervalDays * DAY_MS,
		lapses: card.lapses + (!correct && level >= 2 ? 1 : 0),
	};
}

/** Maps a pre-level (SM-2) card to a level. */
export function legacyLevel(state, intervalDays) {
	if (state !== "review") return 1;
	if (intervalDays >= 30) return 5;
	if (intervalDays >= 14) return 4;
	if (intervalDays >= 7) return 3;
	if (intervalDays >= 3) return 2;
	return 1;
}

/** Typing comparison key. Diacritics are significant. */
export function normalizeAnswer(text) {
	return text
		.normalize("NFC")
		.replace(/[’‘ʼ]/g, "'")
		.replace(/[–—]/g, "-")
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase();
}

const codePointLength = (text) => Array.from(text).length;
const ELIGIBLE_RE = /^[\p{L}\p{M}]+([ '-][\p{L}\p{M}]+)*$/u;
const LETTER_OR_MARK_RE = /^[\p{L}\p{M}]$/u;

/** True iff the word can be asked as a typing prompt. */
export function typingEligible(word) {
	const key = normalizeAnswer(word);
	return key.length > 0 && codePointLength(key) <= 30 && ELIGIBLE_RE.test(key);
}

/** Typing hint for a level; spaces, apostrophes and hyphens are kept. */
export function typingHint(word, level) {
	if (level >= 5) return "";
	const keepFirst = level <= 2;
	let atTokenStart = true;
	let out = "";
	for (const ch of normalizeAnswer(word)) {
		if (LETTER_OR_MARK_RE.test(ch)) {
			out += keepFirst && atTokenStart ? ch : "_";
			atTokenStart = false;
		} else {
			out += ch;
			if (ch === " ") atTokenStart = true;
		}
	}
	return out;
}

/** Interval labels per docs/srs-spec.md §6. */
export function formatInterval(mins) {
	if (mins < 60) return `${mins}m`;
	const d = mins / 1440;
	if (d < 1) return `${Math.round(mins / 60)}h`;
	if (d < 7) return `${Math.round(d)}d`;
	if (d < 30) return `${Math.round(d / 7)}w`;
	if (d < 365) return `${Math.round(d / 30)}mo`;
	return `${(d / 365).toFixed(1)}y`;
}

/**
 * Deterministic per-word Learn step list from eligible minigame kinds at level 1
 * per docs/srs-spec.md §3b rule 3.
 * @param {string[]} eligible
 */
export function learnSteps(eligible) {
	const set = new Set(eligible);
	const steps = ["intro"];
	if (set.has("listeningChoice")) steps.push("listeningChoice");
	else if (set.has("meaningChoice")) steps.push("meaningChoice");
	if (set.has("typing")) steps.push("typing");
	else if (set.has("wordChoice")) steps.push("wordChoice");
	return steps;
}

/**
 * Card state after completing all Learn steps for a word per docs/srs-spec.md §3b rule 7.
 * @param {{ level: number, isWarning: boolean, state: 'new'|'review',
 *           intervalDays: number, dueAt: number, lapses: number }} card
 * @param {number} now epoch ms of completion
 */
export function learned(card, now) {
	return {
		level: MIN_LEVEL,
		isWarning: false,
		state: "review",
		intervalDays: 1,
		dueAt: now + DAY_MS,
		lapses: card.lapses,
	};
}

/**
 * Deterministic Learn queue simulation per docs/srs-spec.md §3b rules 4–7.
 * @param {Array<{ word: string, steps: string[] }>} words
 * @param {string[]} actions
 */
export function simulateLearnQueue(words, actions) {
	const queue = [];
	const firstTry = new Map();
	const firstTryWord = new Map();
	for (const { word, steps } of words) {
		firstTryWord.set(word, true);
		for (const kind of steps) {
			queue.push({ word, kind });
		}
	}
	const total = queue.length;
	let done = 0;
	const shown = [];
	const doneAfterTurn = [];
	const commits = [];
	for (const action of actions) {
		if (queue.length === 0) {
			throw new Error("simulateLearnQueue: action after queue emptied");
		}
		const current = queue[0];
		shown.push(`${current.word}:${current.kind}`);
		if (current.kind === "intro") {
			if (action !== "continue") {
				throw new Error(
					`simulateLearnQueue: expected "continue" for intro, got "${action}"`,
				);
			}
			queue.shift();
			done += 1;
			if (!queue.some((s) => s.word === current.word)) {
				commits.push({
					word: current.word,
					grade: firstTryWord.get(current.word) ? "good" : "again",
				});
			}
		} else {
			if (action !== "correct" && action !== "wrong" && action !== "forgot") {
				throw new Error(
					`simulateLearnQueue: invalid scored action "${action}"`,
				);
			}
			const stepKey = `${current.word}:${current.kind}`;
			if (!firstTry.has(stepKey)) {
				const ok = action === "correct";
				firstTry.set(stepKey, ok);
				if (!ok) firstTryWord.set(current.word, false);
			}
			queue.shift();
			if (action === "correct") {
				done += 1;
				if (!queue.some((s) => s.word === current.word)) {
					commits.push({
						word: current.word,
						grade: firstTryWord.get(current.word) ? "good" : "again",
					});
				}
			} else {
				queue.push(current);
			}
		}
		doneAfterTurn.push(done);
	}
	if (queue.length !== 0) {
		throw new Error(
			`simulateLearnQueue: queue not empty at end (${queue.length} remaining)`,
		);
	}
	return { total, shown, done: doneAfterTurn, commits };
}

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

/** Fixed epoch base so every vector is deterministic: 2023-11-14T22:13:20Z. */
const NOW = 1_700_000_000_000;

const cardAt = (level, isWarning, state = "review", lapses = 2) => ({
	level,
	isWarning,
	state,
	intervalDays: 0,
	dueAt: NOW,
	lapses,
});

function answerVector(name, input, correct) {
	return {
		name,
		input: { ...input },
		correct,
		now: NOW,
		expected: applyAnswer(input, correct, NOW),
	};
}

const answers = [];
for (const [level, isWarning] of [
	[1, false],
	[2, false],
	[3, false],
	[4, false],
	[5, false],
	[5, true],
]) {
	const label = `level ${level}${isWarning ? " flagged" : ""}`;
	answers.push(
		answerVector(`${label} + correct`, cardAt(level, isWarning), true),
	);
	answers.push(
		answerVector(`${label} + wrong`, cardAt(level, isWarning), false),
	);
}
answers.push(
	answerVector(
		"new card level 1 + correct -> review",
		cardAt(1, false, "new", 0),
		true,
	),
);
answers.push(
	answerVector(
		"new card level 1 + wrong -> review, lapses stay 0",
		cardAt(1, false, "new", 0),
		false,
	),
);

const legacy = [
	["new", 0],
	["learning", 0],
	["learning", 5],
	["review", 1],
	["review", 2],
	["review", 3],
	["review", 6],
	["review", 7],
	["review", 13],
	["review", 14],
	["review", 29],
	["review", 30],
	["review", 210],
].map(([state, intervalDays]) => ({
	state,
	intervalDays,
	expectedLevel: legacyLevel(state, intervalDays),
}));

// Non-ASCII characters are written as precomposed (NFC) literals.
const CAFE = "café";
const PHO = "phở";
const typing = [
	["teacher", "teacher"],
	["teacher", "  teacher "],
	["teacher", "TEACHER"],
	["ice cream", "ice  cream"],
	["o'clock", "o’clock"],
	["well-known", "well–known"],
	["teacher", "teachar"],
	["teacher", "teachr"],
	[CAFE, CAFE],
	[CAFE, "cafe"],
	["teacher", ""],
	["look after", "Look After"],
	[CAFE, "café"],
	[PHO, "pho"],
].map(([word, typed]) => ({
	word,
	typed,
	match:
		typed.trim() !== "" && normalizeAnswer(typed) === normalizeAnswer(word),
}));

const eligibility = [
	"teacher",
	"ice cream",
	"o'clock",
	"o’clock",
	"well-known",
	CAFE,
	PHO,
	"Mr.",
	"5 o'clock",
	"a/an",
	"a".repeat(31),
].map((word) => ({ word, typingEligible: typingEligible(word) }));

const hints = [
	["teacher", 1],
	["teacher", 2],
	["teacher", 3],
	["teacher", 4],
	["teacher", 5],
	["ice cream", 1],
	["ice cream", 3],
	["o'clock", 2],
	["o'clock", 4],
	["well-known", 1],
	["ice-cream", 1],
].map(([word, level]) => ({ word, level, hint: typingHint(word, level) }));

const intervals = [10, 1440, 10080, 21600, 43200, 52560, 525600, 4320].map(
	(minutes) => ({
		minutes,
		label: formatInterval(minutes),
	}),
);

const learnStepsVectors = [
	["meaningChoice", "wordChoice", "listeningChoice", "typing"],
	["meaningChoice", "wordChoice", "typing"],
	["meaningChoice", "wordChoice", "listeningChoice"],
	["meaningChoice"],
	["wordChoice"],
	["listeningChoice"],
	["typing"],
	[],
	["listeningChoice", "wordChoice"],
].map((eligible) => ({ eligible, steps: learnSteps(eligible) }));

const learnQueueVectors = [
	{
		name: "all correct",
		words: [
			{ word: "w1", steps: ["intro", "listeningChoice", "typing"] },
			{ word: "w2", steps: ["intro", "meaningChoice", "wordChoice"] },
		],
		actions: [
			"continue",
			"correct",
			"correct",
			"continue",
			"correct",
			"correct",
		],
	},
	{
		name: "wrong middle step requeues to end and commits after other words with grade again",
		words: [
			{ word: "w1", steps: ["intro", "listeningChoice", "typing"] },
			{ word: "w2", steps: ["intro", "meaningChoice", "typing"] },
		],
		actions: [
			"continue",
			"wrong",
			"correct",
			"continue",
			"correct",
			"correct",
			"correct",
		],
	},
	{
		name: "forgot on typing step requeues and logs again",
		words: [{ word: "w1", steps: ["intro", "listeningChoice", "typing"] }],
		actions: ["continue", "correct", "forgot", "correct"],
	},
	{
		name: "wrong twice on the same step",
		words: [{ word: "w1", steps: ["intro", "meaningChoice", "typing"] }],
		actions: ["continue", "wrong", "correct", "wrong", "correct"],
	},
	{
		name: "word with only intro",
		words: [{ word: "w1", steps: ["intro"] }],
		actions: ["continue"],
	},
	{
		name: "two words where first word misses last step and commits after second word",
		words: [
			{ word: "w1", steps: ["intro", "listeningChoice", "typing"] },
			{ word: "w2", steps: ["intro", "listeningChoice", "typing"] },
		],
		actions: [
			"continue",
			"correct",
			"wrong",
			"continue",
			"correct",
			"correct",
			"correct",
		],
	},
].map(({ name, words, actions }) => ({
	name,
	words,
	actions,
	expected: simulateLearnQueue(words, actions),
}));

function learnCommitVector(name, input, now) {
	return {
		name,
		input: { ...input },
		now,
		expected: learned(input, now),
	};
}

const learnCommitVectors = [
	learnCommitVector("new card default", cardAt(1, false, "new", 0), NOW),
	learnCommitVector(
		"new card with non-zero lapses preserved",
		cardAt(1, false, "new", 3),
		NOW,
	),
	learnCommitVector(
		"new card with offset dueAt",
		{ ...cardAt(1, false, "new", 0), dueAt: NOW - 5000 },
		NOW + 10_000,
	),
];

// ---------------------------------------------------------------------------
// Guards: a miscount or a drifting label fails loudly.
// ---------------------------------------------------------------------------

const EXPECTED_COUNTS = {
	answers: 14,
	legacy: 13,
	typing: 14,
	eligibility: 11,
	hints: 11,
	intervals: 8,
	learnSteps: 9,
	learnQueue: 6,
	learnCommit: 3,
};
const ACTUAL_COUNTS = {
	answers: answers.length,
	legacy: legacy.length,
	typing: typing.length,
	eligibility: eligibility.length,
	hints: hints.length,
	intervals: intervals.length,
	learnSteps: learnStepsVectors.length,
	learnQueue: learnQueueVectors.length,
	learnCommit: learnCommitVectors.length,
};
for (const key of Object.keys(EXPECTED_COUNTS)) {
	if (ACTUAL_COUNTS[key] !== EXPECTED_COUNTS[key]) {
		throw new Error(
			`vector count for ${key}: got ${ACTUAL_COUNTS[key]}, expected ${EXPECTED_COUNTS[key]}`,
		);
	}
}

const LABEL_CHECKS = [
	[10, "10m"],
	[59, "59m"],
	[90, "2h"], // 90/60 = 1.5, Math.round -> 2; deliberate, do not "fix" to 1h
	[1440, "1d"],
	[4320, "3d"],
	[10080, "1w"], // exactly 7 d: `d < 7` is false, so weeks
	[43200, "1mo"], // exactly 30 d: `d < 30` is false, so months
	[525600, "1.0y"], // exactly 365 d -> years, always one decimal
];
for (const [mins, expected] of LABEL_CHECKS) {
	const got = formatInterval(mins);
	if (got !== expected) {
		throw new Error(
			`formatInterval(${mins}) = "${got}", expected "${expected}"`,
		);
	}
}

// ---------------------------------------------------------------------------
// Emit / check
// ---------------------------------------------------------------------------

const outPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"level-vectors.json",
);
const doc = `${JSON.stringify(
	{
		spec: "docs/srs-spec.md v2",
		epochBase: NOW,
		answers,
		legacy,
		typing,
		eligibility,
		hints,
		intervals,
		learnSteps: learnStepsVectors,
		learnQueue: learnQueueVectors,
		learnCommit: learnCommitVectors,
	},
	null,
	2,
)}\n`;

const totalVectorCount =
	answers.length +
	legacy.length +
	typing.length +
	eligibility.length +
	hints.length +
	intervals.length +
	learnStepsVectors.length +
	learnQueueVectors.length +
	learnCommitVectors.length;

const isMain =
	process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
	if (process.argv.includes("--check")) {
		let committed;
		try {
			committed = readFileSync(outPath, "utf8");
		} catch {
			console.error(
				`--check FAILED: ${outPath} does not exist. Run: node shared/srs/generate-level-vectors.mjs`,
			);
			process.exit(1);
		}
		if (committed !== doc) {
			console.error(
				"--check FAILED: committed level-vectors.json differs from generated output.",
			);
			console.error(
				"Regenerate with: node shared/srs/generate-level-vectors.mjs",
			);
			process.exit(1);
		}
		console.log(`--check OK: ${totalVectorCount} vectors are current.`);
		process.exit(0);
	}
	writeFileSync(outPath, doc);
	console.log(`Wrote ${outPath}.`);
}
