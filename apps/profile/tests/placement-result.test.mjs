import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProfile } from "../build.mjs";
import {
	pickSupportedRecorderMime,
	resolveSpeakingUploadMeta,
} from "../public/kiem-tra-dau-vao/grading.js";
import {
	buildHighlightSegments,
	buildSkillRubricDisplay,
	categoryLabel,
	errorNumberLabel,
	normalizePlacementErrorCategory,
	numberErrors,
	PLACEMENT_ERROR_CATEGORIES,
	PLACEMENT_SPEAKING_ERROR_CATEGORIES,
	PLACEMENT_WRITING_ERROR_CATEGORIES,
	placementErrorCategoriesForSkill,
} from "../public/kiem-tra-dau-vao/ket-qua/highlight.js";
import {
	buildAnnotatedText,
	buildLegend,
	renderResult,
	rubricList,
} from "../public/kiem-tra-dau-vao/ket-qua/result.js";

const resultDir = new URL(
	"../public/kiem-tra-dau-vao/ket-qua/",
	import.meta.url,
);
const apiContractsPath = new URL(
	"../../../packages/api/src/placement-test-contracts.ts",
	import.meta.url,
);
const ieltsBandPath = new URL(
	"../../../packages/api/src/lib/ielts-band.ts",
	import.meta.url,
);
const err = (partial) => ({
	id: partial.id ?? `e-${partial.quote}`,
	category: "grammar",
	correction: "",
	explanation: "",
	start: null,
	end: null,
	...partial,
});

test("buildHighlightSegments sorts errors, numbers them and reassembles the text", () => {
	const text = "I goed to school and eated lunch.";
	const errors = [
		err({ quote: "eated", start: 21, end: 26, category: "spelling" }),
		err({ quote: "goed", start: 2, end: 6 }),
	];
	const segs = buildHighlightSegments(text, errors);
	assert.equal(segs.map((s) => s.text).join(""), text);
	const marked = segs.filter((s) => s.error);
	assert.deepEqual(
		marked.map((s) => [s.text, s.error.number]),
		[
			["goed", 1],
			["eated", 2],
		],
	);
	assert.equal(marked[1].error.category, "spelling");
});

test("buildHighlightSegments skips null offsets, out-of-range and overlapping errors", () => {
	const text = "She go to school";
	const errors = [
		err({ quote: "go to", start: 4, end: 9 }),
		err({ quote: "to school", start: 7, end: 16 }),
		err({ quote: "missing" }),
		err({ quote: "far", start: 100, end: 110 }),
	];
	const segs = buildHighlightSegments(text, errors);
	assert.equal(segs.map((s) => s.text).join(""), text);
	assert.deepEqual(
		segs.filter((s) => s.error).map((s) => s.text),
		["go to"],
	);
});

test("numberErrors puts unlocated errors last and keeps their original order", () => {
	const numbered = numberErrors([
		err({ id: "a", quote: "x" }),
		err({ id: "b", quote: "y", start: 5, end: 6 }),
		err({ id: "c", quote: "z" }),
	]);
	assert.deepEqual(
		numbered.map((e) => [e.id, e.number]),
		[
			["b", 1],
			["a", 2],
			["c", 3],
		],
	);
	assert.equal(errorNumberLabel(1), "①");
	assert.equal(errorNumberLabel(21), "(21)");
});

test("buildHighlightSegments handles empty input and non-BMP offsets in UTF-16 units", () => {
	assert.deepEqual(buildHighlightSegments("", []), []);
	assert.deepEqual(buildHighlightSegments("abc", undefined), [
		{ text: "abc", error: null },
	]);
	const text = "😀 bad word";
	const segs = buildHighlightSegments(text, [
		err({ quote: "bad", start: 3, end: 6 }),
	]);
	assert.equal(segs.find((s) => s.error)?.text, "bad");
});

test("pickSupportedRecorderMime prefers audio/webm opus and never returns video", () => {
	const make = (supported) => ({
		isTypeSupported: (m) => supported.includes(m),
	});
	assert.equal(
		pickSupportedRecorderMime(
			make(["audio/webm;codecs=opus", "audio/webm", "video/webm"]),
		),
		"audio/webm;codecs=opus",
	);
	assert.equal(pickSupportedRecorderMime(make(["audio/mp4"])), "audio/mp4");
	assert.equal(
		pickSupportedRecorderMime(make(["audio/ogg", "video/webm"])),
		"audio/ogg",
	);
	assert.equal(pickSupportedRecorderMime(make(["video/webm"])), "");
	assert.equal(pickSupportedRecorderMime(undefined), "");
	assert.equal(pickSupportedRecorderMime({}), "");
});

test("resolveSpeakingUploadMeta maps recorder mimes to audio content types", () => {
	assert.deepEqual(resolveSpeakingUploadMeta("audio/webm;codecs=opus"), {
		contentType: "audio/webm",
		filename: "speaking.webm",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/mp4"), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/ogg;codecs=opus"), {
		contentType: "audio/ogg",
		filename: "speaking.ogg",
	});
});

test("result page renders server data without innerHTML and is private", () => {
	const js = readFileSync(new URL("result.js", resultDir), "utf8");
	const hl = readFileSync(new URL("highlight.js", resultDir), "utf8");
	const html = readFileSync(new URL("index.html", resultDir), "utf8");
	for (const src of [js, hl]) {
		assert.ok(
			!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src),
		);
	}
	assert.match(html, /<meta name="robots" content="noindex/);
	assert.match(html, /<meta name="referrer" content="no-referrer">/);
	assert.match(js, /referrerPolicy: "no-referrer"/);
	assert.match(html, /<meta name="lead-api" content="[^"]+">/);
});

test("buildProfile copies the result page and injects the lead API", async () => {
	const dist = mkdtempSync(join(tmpdir(), "profile-result-"));
	try {
		await buildProfile({
			distUrl: new URL(`file://${dist}/dist/`),
			leadApiUrl: "https://api.example.test",
			studentPortalUrl: "",
			maintenance: false,
		});
		const built = readFileSync(
			join(dist, "dist", "kiem-tra-dau-vao", "ket-qua", "index.html"),
			"utf8",
		);
		assert.match(
			built,
			/<meta name="lead-api" content="https:\/\/api\.example\.test">/,
		);
		for (const f of ["result.js", "highlight.js", "result.css"]) {
			assert.ok(
				readFileSync(
					join(dist, "dist", "kiem-tra-dau-vao", "ket-qua", f),
					"utf8",
				).length > 0,
			);
		}
	} finally {
		rmSync(dist, { recursive: true, force: true });
	}
});

function createFakeDom() {
	class FakeTextNode {
		constructor(data) {
			this.nodeType = 3;
			this.data = String(data);
		}
		get textContent() {
			return this.data;
		}
	}

	class FakeElement {
		constructor(tagName) {
			this.nodeType = 1;
			this.tagName = tagName.toLowerCase();
			this.attributes = new Map();
			this.children = [];
			this.className = "";
		}
		setAttribute(name, value) {
			if (name === "class") this.className = String(value);
			else this.attributes.set(name, String(value));
		}
		getAttribute(name) {
			if (name === "class") return this.className;
			return this.attributes.get(name) ?? null;
		}
		appendChild(node) {
			this.children.push(node);
			return node;
		}
		replaceChildren(...nodes) {
			this.children = [...nodes];
		}
		get textContent() {
			return this.children.map((c) => c.textContent).join("");
		}
		findAll(predicate, out = []) {
			if (predicate(this)) out.push(this);
			for (const child of this.children) {
				if (child instanceof FakeElement) child.findAll(predicate, out);
			}
			return out;
		}
	}

	const root = new FakeElement("div");
	root.setAttribute("id", "resultRoot");
	const doc = {
		createElement: (tag) => new FakeElement(tag),
		createTextNode: (text) => new FakeTextNode(text),
		getElementById: (id) => (id === "resultRoot" ? root : null),
	};
	return { doc, root };
}

function withFakeDom(fn) {
	const prev = globalThis.document;
	const { doc, root } = createFakeDom();
	globalThis.document = doc;
	try {
		return fn({ doc, root });
	} finally {
		if (prev === undefined) delete globalThis.document;
		else globalThis.document = prev;
	}
}

function parseCriterionLabelsFromApi() {
	const bandSrc = readFileSync(ieltsBandPath, "utf8");
	const blockMatch = bandSrc.match(
		/const CRITERION_LABELS[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
	);
	assert.ok(blockMatch, "Could not locate CRITERION_LABELS in ielts-band.ts");
	const labels = { writing: {}, speaking: {} };
	for (const skill of ["writing", "speaking"]) {
		const skillMatch = blockMatch[1].match(
			new RegExp(`${skill}:\\s*\\{([\\s\\S]*?)\\}`),
		);
		assert.ok(skillMatch, `Missing ${skill} block in CRITERION_LABELS`);
		for (const m of skillMatch[1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
			labels[skill][m[1]] = m[2];
		}
	}
	const taskMatch = bandSrc.match(/part === "task1" \? "([^"]+)" : "([^"]+)"/);
	assert.ok(taskMatch, "Could not locate task1/task2 labels in ielts-band.ts");
	return (skill, key, part) => {
		if (skill === "writing" && key === "task") {
			return part === "task1" ? taskMatch[1] : taskMatch[2];
		}
		return labels[skill][key] ?? key;
	};
}

function parseContractErrorCategories(contractsSrc, exportName, resolveLabel) {
	const arrayMatch = contractsSrc.match(
		new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`),
	);
	assert.ok(
		arrayMatch,
		`Could not locate ${exportName} in placement-test-contracts.ts`,
	);
	const entries = [];
	const itemRe =
		/key:\s*"([^"]+)"[\s\S]*?label:\s*criterionLabel\(\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]*)"\s*\)/g;
	for (const m of arrayMatch[1].matchAll(itemRe)) {
		entries.push({
			key: m[1],
			label: resolveLabel(m[2], m[3], m[4]),
		});
	}
	assert.ok(entries.length > 0, `Parsed 0 entries for ${exportName}`);
	return entries;
}

test("placementErrorCategoriesForSkill returns exact 4 IELTS criteria per skill with English labels", () => {
	assert.deepEqual(placementErrorCategoriesForSkill("writing"), [
		{ key: "task", label: "Task Response" },
		{ key: "coherence", label: "Coherence & Cohesion" },
		{ key: "lexical", label: "Lexical Resource" },
		{ key: "grammar", label: "Grammatical Range & Accuracy" },
	]);
	assert.deepEqual(placementErrorCategoriesForSkill("speaking"), [
		{ key: "fluency", label: "Fluency & Coherence" },
		{ key: "lexical", label: "Lexical Resource" },
		{ key: "grammar", label: "Grammatical Range & Accuracy" },
		{ key: "pronunciation", label: "Pronunciation" },
	]);
	assert.deepEqual(PLACEMENT_ERROR_CATEGORIES, [
		{ key: "task", label: "Task Response" },
		{ key: "coherence", label: "Coherence & Cohesion" },
		{ key: "fluency", label: "Fluency & Coherence" },
		{ key: "lexical", label: "Lexical Resource" },
		{ key: "grammar", label: "Grammatical Range & Accuracy" },
		{ key: "pronunciation", label: "Pronunciation" },
	]);
});

test("highlight.js error categories stay in parity with packages/api/src/placement-test-contracts.ts", () => {
	const contractsSrc = readFileSync(apiContractsPath, "utf8");
	const resolveLabel = parseCriterionLabelsFromApi();

	assert.deepEqual(
		PLACEMENT_WRITING_ERROR_CATEGORIES,
		parseContractErrorCategories(
			contractsSrc,
			"PLACEMENT_WRITING_ERROR_CATEGORIES",
			resolveLabel,
		),
	);
	assert.deepEqual(
		PLACEMENT_SPEAKING_ERROR_CATEGORIES,
		parseContractErrorCategories(
			contractsSrc,
			"PLACEMENT_SPEAKING_ERROR_CATEGORIES",
			resolveLabel,
		),
	);
	assert.deepEqual(
		PLACEMENT_ERROR_CATEGORIES,
		parseContractErrorCategories(
			contractsSrc,
			"PLACEMENT_ERROR_CATEGORIES",
			resolveLabel,
		),
	);

	const css = readFileSync(new URL("result.css", resultDir), "utf8");
	for (const { key } of PLACEMENT_ERROR_CATEGORIES) {
		assert.match(css, new RegExp(`\\.err-${key}\\s*\\{`));
		assert.match(css, new RegExp(`\\.err-border-${key}\\s*\\{`));
	}
	assert.doesNotMatch(css, /\.err-vocabulary\b|\.err-spelling\b/);
});

test("normalizePlacementErrorCategory normalizes canonical, legacy and cross-skill keys", () => {
	// Canonical Writing
	assert.equal(normalizePlacementErrorCategory("task", "writing"), "task");
	assert.equal(
		normalizePlacementErrorCategory("coherence", "writing"),
		"coherence",
	);
	assert.equal(
		normalizePlacementErrorCategory("lexical", "writing"),
		"lexical",
	);
	assert.equal(
		normalizePlacementErrorCategory("grammar", "writing"),
		"grammar",
	);

	// Canonical Speaking
	assert.equal(
		normalizePlacementErrorCategory("fluency", "speaking"),
		"fluency",
	);
	assert.equal(
		normalizePlacementErrorCategory("lexical", "speaking"),
		"lexical",
	);
	assert.equal(
		normalizePlacementErrorCategory("grammar", "speaking"),
		"grammar",
	);
	assert.equal(
		normalizePlacementErrorCategory("pronunciation", "speaking"),
		"pronunciation",
	);

	// Legacy keys on both skills
	assert.equal(
		normalizePlacementErrorCategory("vocabulary", "writing"),
		"lexical",
	);
	assert.equal(
		normalizePlacementErrorCategory("spelling", "writing"),
		"lexical",
	);
	assert.equal(
		normalizePlacementErrorCategory("vocabulary", "speaking"),
		"lexical",
	);
	assert.equal(
		normalizePlacementErrorCategory("spelling", "speaking"),
		"lexical",
	);

	// Cross-skill normalization
	assert.equal(
		normalizePlacementErrorCategory("fluency", "writing"),
		"coherence",
	);
	assert.equal(
		normalizePlacementErrorCategory("pronunciation", "writing"),
		"lexical",
	);
	assert.equal(
		normalizePlacementErrorCategory("coherence", "speaking"),
		"fluency",
	);
	assert.equal(normalizePlacementErrorCategory("task", "speaking"), "fluency");

	// Case/whitespace tolerance and invalid values
	assert.equal(
		normalizePlacementErrorCategory("  VOCABULARY ", "writing"),
		"lexical",
	);
	assert.equal(normalizePlacementErrorCategory("unknown", "writing"), null);
	assert.equal(normalizePlacementErrorCategory("", "speaking"), null);
	assert.equal(normalizePlacementErrorCategory(null, "writing"), null);
	assert.equal(normalizePlacementErrorCategory(undefined, "speaking"), null);
});

test("categoryLabel returns English labels and normalizes legacy/cross-skill keys when skill is given", () => {
	assert.equal(categoryLabel("task"), "Task Response");
	assert.equal(categoryLabel("fluency"), "Fluency & Coherence");
	assert.equal(categoryLabel("vocabulary", "writing"), "Lexical Resource");
	assert.equal(categoryLabel("spelling", "speaking"), "Lexical Resource");
	assert.equal(categoryLabel("coherence", "speaking"), "Fluency & Coherence");
	assert.equal(categoryLabel("fluency", "writing"), "Coherence & Cohesion");
	assert.equal(categoryLabel("pronunciation", "writing"), "Lexical Resource");
	assert.equal(categoryLabel("custom_key", "writing"), "custom_key");
});

test("buildSkillRubricDisplay attaches trimmed criterionComments for IELTS rubrics and clears empty or legacy comments", () => {
	const writing = buildSkillRubricDisplay(
		"writing",
		6.5,
		{ task: 6.5, coherence: 6, lexical: 6.5, grammar: 6 },
		{
			task: "  Trả lời đúng trọng tâm.\nCần thêm ví dụ.  ",
			coherence: "   ",
			lexical: "",
			grammar: "Ổn ở câu đơn.",
		},
	);
	assert.equal(writing.isIelts, true);
	assert.deepEqual(
		writing.criteria.map((c) => [c.key, c.comment]),
		[
			["task", "Trả lời đúng trọng tâm.\nCần thêm ví dụ."],
			["coherence", ""],
			["lexical", ""],
			["grammar", "Ổn ở câu đơn."],
		],
	);

	const speakingNoComments = buildSkillRubricDisplay(
		"speaking",
		7,
		{ fluency: 7, lexical: 6.5, grammar: 7, pronunciation: 7 },
		null,
	);
	assert.equal(speakingNoComments.isIelts, true);
	assert.deepEqual(
		speakingNoComments.criteria.map((c) => c.comment),
		["", "", "", ""],
	);

	const legacyWriting = buildSkillRubricDisplay(
		"writing",
		12,
		{ ct: 4, or: 4, lg: 4 },
		{ ct: "Should not attach", task: "Ignored for legacy" },
	);
	assert.equal(legacyWriting.isIelts, false);
	assert.deepEqual(
		legacyWriting.criteria.map((c) => c.comment),
		["", "", ""],
	);
});

test("result.js renders skill-specific legends, normalized error highlights, synced criterion cards, and optional criterion comments", () => {
	withFakeDom(({ root }) => {
		const wLegend = buildLegend("writing");
		const wLegendItems = wLegend.findAll((el) => el.tagName === "li");
		assert.deepEqual(
			wLegendItems.map((li) => li.textContent),
			[
				"Aa Task Response",
				"Aa Coherence & Cohesion",
				"Aa Lexical Resource",
				"Aa Grammatical Range & Accuracy",
			],
		);

		const sLegend = buildLegend("speaking");
		const sLegendItems = sLegend.findAll((el) => el.tagName === "li");
		assert.deepEqual(
			sLegendItems.map((li) => li.textContent),
			[
				"Aa Fluency & Coherence",
				"Aa Lexical Resource",
				"Aa Grammatical Range & Accuracy",
				"Aa Pronunciation",
			],
		);

		const [textBox, cards] = buildAnnotatedText({
			prefix: "w",
			skill: "writing",
			text: "Good vocabulry and fluancy.",
			errors: [
				err({
					id: "e1",
					category: "spelling",
					quote: "vocabulry",
					start: 5,
					end: 14,
					correction: "vocabulary",
				}),
				err({
					id: "e2",
					category: "fluency",
					quote: "fluancy",
					start: 19,
					end: 26,
					correction: "coherence",
				}),
			],
		});
		const marks = textBox.findAll((el) => el.tagName === "mark");
		assert.deepEqual(
			marks.map((m) => m.className),
			["err-mark err-lexical", "err-mark err-coherence"],
		);
		const cardItems = cards.findAll((el) => el.tagName === "li");
		assert.deepEqual(
			cardItems.map((li) => li.className),
			["error-card err-border-lexical", "error-card err-border-coherence"],
		);
		const cardTitles = cards
			.findAll((el) => el.tagName === "strong")
			.map((s) => s.textContent);
		assert.deepEqual(cardTitles, ["Lexical Resource", "Coherence & Cohesion"]);

		// IELTS rubric list renders synced border classes, dots, and only non-empty comments
		const ieltsDisplay = buildSkillRubricDisplay(
			"writing",
			6.5,
			{ task: 6.5, coherence: 6, lexical: 6.5, grammar: 6 },
			{
				task: "Đủ ý chính.",
				coherence: "",
				lexical: "   ",
				grammar: "Cẩn thận thì.",
			},
		);
		const ieltsList = rubricList(ieltsDisplay.criteria, ieltsDisplay.isIelts);
		assert.equal(ieltsList.className, "result-rubric result-rubric--criteria");
		const tiles = ieltsList.findAll((el) => el.tagName === "div");
		assert.deepEqual(
			tiles.map((t) => t.className),
			[
				"result-stat result-stat--criterion err-border-task",
				"result-stat result-stat--criterion err-border-coherence",
				"result-stat result-stat--criterion err-border-lexical",
				"result-stat result-stat--criterion err-border-grammar",
			],
		);
		assert.equal(
			ieltsList.findAll((el) => el.className === "criterion-dot").length,
			4,
		);
		const comments = ieltsList.findAll(
			(el) => el.className === "result-criterion-comment",
		);
		assert.ok(comments.every((el) => el.tagName === "dd"));
		assert.deepEqual(
			comments.map((p) => [
				p.getAttribute("data-criterion-comment"),
				p.textContent,
			]),
			[
				["task", "Đủ ý chính."],
				["grammar", "Cẩn thận thì."],
			],
		);

		// Unknown error categories fall back to grammar CSS class without interpolating raw strings
		const [fallbackBox, fallbackCards] = buildAnnotatedText({
			prefix: "u",
			skill: "writing",
			text: "Hello world",
			errors: [
				err({
					id: "u1",
					category: "unknown-cat injected",
					quote: "Hello",
					start: 0,
					end: 5,
				}),
			],
		});
		const fallbackMark = fallbackBox.findAll((el) => el.tagName === "mark")[0];
		assert.equal(fallbackMark.className, "err-mark err-grammar");
		const fallbackCard = fallbackCards.findAll((el) => el.tagName === "li")[0];
		assert.equal(fallbackCard.className, "error-card err-border-grammar");

		// Legacy rubric omits IELTS criterion classes, dots and comments
		const legacyDisplay = buildSkillRubricDisplay(
			"writing",
			12,
			{ ct: 4, or: 4, lg: 4 },
			{ ct: "Hidden" },
		);
		const legacyList = rubricList(
			legacyDisplay.criteria,
			legacyDisplay.isIelts,
		);
		assert.equal(legacyList.className, "result-rubric");
		assert.equal(
			legacyList.findAll((el) => el.className === "criterion-dot").length,
			0,
		);
		assert.equal(
			legacyList.findAll((el) => el.className === "result-criterion-comment")
				.length,
			0,
		);

		// Full renderResult keeps overall teacherFeedback intact alongside criterion comments
		renderResult({
			studentName: "Minh Anh",
			submittedAt: "2026-11-20T00:00:00Z",
			gradedAt: "2026-11-20T01:00:00Z",
			objective: {
				listening: { correct: 8, total: 10, pct: 80 },
				vocabGrammar: { correct: 12, total: 15, pct: 80 },
				reading: { correct: 9, total: 10, pct: 90 },
			},
			writingText: "I goed home.",
			writingRubric: { task: 6, coherence: 6, lexical: 5.5, grammar: 5.5 },
			writingScore: 6,
			writingCriterionComments: {
				task: "Rõ ý.",
				coherence: "",
				lexical: "",
				grammar: "Sai quá khứ.",
			},
			writingErrors: [
				err({
					id: "w1",
					category: "grammar",
					quote: "goed",
					start: 2,
					end: 6,
					correction: "went",
				}),
			],
			speakingStatus: "uploaded",
			speakingTranscript: "Hello everyone.",
			speakingRubric: {
				fluency: 6.5,
				lexical: 6,
				grammar: 6,
				pronunciation: 6.5,
			},
			speakingScore: 6.5,
			speakingCriterionComments: {
				fluency: "Nói tự nhiên.",
				lexical: "",
				grammar: "",
				pronunciation: "",
			},
			speakingErrors: [],
			finalBandLevel: "B2",
			finalDisplayCourse: "IELTS Foundation",
			finalScorePct: 82,
			finalNote: "",
			bandAdvice: "",
			teacherFeedback: "Nhận xét tổng thể rất tốt!",
		});

		const renderedComments = root.findAll(
			(el) => el.className === "result-criterion-comment",
		);
		assert.deepEqual(
			renderedComments.map((p) => [
				p.getAttribute("data-criterion-comment"),
				p.textContent,
			]),
			[
				["task", "Rõ ý."],
				["grammar", "Sai quá khứ."],
				["fluency", "Nói tự nhiên."],
			],
		);
		const feedbackHeading = root.findAll(
			(el) => el.tagName === "h2" && el.getAttribute("id") === "secFeedback",
		);
		assert.equal(feedbackHeading.length, 1);
		assert.equal(feedbackHeading[0].textContent, "Nhận xét của cô");
		const feedbackProse = root.findAll((el) => el.className === "result-prose");
		assert.ok(
			feedbackProse.some((p) => p.textContent === "Nhận xét tổng thể rất tốt!"),
		);
	});
});
