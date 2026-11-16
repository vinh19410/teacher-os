import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { buildProfile } from "../build.mjs";
import {
	buildProvisionalSummary,
	canReplaySpeakingPrompt,
	computeSpeechFallbackTimeoutMs,
	countObjectiveProgress,
	countWords,
	createInitialSpeakingSession,
	LEAD_PLACEMENT_MAX,
	matchBandByPct,
	normalizeGapAnswer,
	resolveReadingRenderState,
	resolveRestoredAttemptStep,
	resolveSpeakingStatusDisplay,
	resolveSpeakingStepState,
	resolveSpeakingSubmitDecision,
	resolveTaskTimings,
	resolveWritingPromptState,
	scoreObjectiveTest,
	startSpeakingTaskReading,
	stripInlineCefrLabel,
	transitionSpeakingAfterReading,
	transitionSpeakingNextTask,
	transitionSpeakingToAnswer,
} from "../public/kiem-tra-dau-vao/grading.js";
import {
	buildLeadPayload,
	buildPlacementSubmissionLead,
	isValidBirthDate,
	LEAD_MIN_SAFE_ELAPSED_MS,
	leadErrorMessage,
	normalizeVietnamPhone,
	PLACEMENT_COURSE_GROUPS,
	PLACEMENT_STUDY_MODES,
	validateLeadForm,
} from "../public/kiem-tra-dau-vao/lead-gate.js";
import { createProfileServer } from "../serve.mjs";

const publicDir = new URL("../public/", import.meta.url);
const placementDir = new URL("../public/kiem-tra-dau-vao/", import.meta.url);

function walkFiles(dirUrl) {
	const results = [];
	for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
		const childUrl = new URL(
			entry.isDirectory() ? `${entry.name}/` : entry.name,
			dirUrl,
		);
		if (entry.isDirectory()) {
			results.push(...walkFiles(childUrl));
		} else if (/\.(html|js|mjs|css|json|txt)$/i.test(entry.name)) {
			results.push(childUrl);
		}
	}
	return results;
}

function createFiveSkillSnapshotFixture() {
	return {
		version: 2,
		bands: [
			{
				min: 0,
				max: 24,
				cefr: "Pre-A1",
				course: "comm-1",
				courseLabel: "Giao tiếp 1",
				displayCourse: "Giao tiếp 1",
				advice: "Bắt đầu từ nền tảng.",
			},
			{
				min: 25,
				max: 44,
				cefr: "A1",
				course: "comm-1",
				courseLabel: "Giao tiếp 1",
				displayCourse: "Giao tiếp 1",
				advice: "Củng cố phản xạ cơ bản.",
			},
			{
				min: 45,
				max: 64,
				cefr: "A2",
				course: "comm-2",
				courseLabel: "Giao tiếp 2",
				displayCourse: "Giao tiếp 2",
				advice: "Mở rộng giao tiếp ứng dụng.",
			},
			{
				min: 65,
				max: 84,
				cefr: "A2+",
				course: "comm-3",
				courseLabel: "Giao tiếp 3",
				displayCourse: "Giao tiếp 3",
				advice: "Chuẩn bị tiền IELTS.",
			},
			{
				min: 85,
				max: 100,
				cefr: "B1+",
				course: "ielts-found",
				courseLabel: "IELTS Foundation",
				displayCourse: "IELTS Foundation",
				advice: "Sẵn sàng luyện thi IELTS.",
			},
		],
		parts: [
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-1",
						partLabel: "Part 1",
						instruction: "Choose the correct answer.",
						title: "Daily Life",
						notesTitle: "",
						src: "/public/placement-test/audio/clip-1",
						maxPlays: 2,
						level: "A1",
						questions: [
							{
								id: "l-q1",
								type: "mcq",
								level: "A1",
								prompt: "What time is the class?",
								options: ["8:00", "9:00", "10:00"],
								answer: 1,
							},
						],
					},
					{
						id: "clip-2",
						partLabel: "Part 2",
						instruction: "Write ONE word or number.",
						title: "Museum Notes",
						notesTitle: "CAMBRIDGE MUSEUM",
						src: "/public/placement-test/audio/clip-2",
						maxPlays: 2,
						level: "A2",
						questions: [
							{
								id: "l-q2",
								type: "gap",
								level: "A2",
								prompt: "Closing time:",
								accept: ["7:30 p.m.", "19:30"],
							},
							{
								id: "l-q3",
								type: "gap",
								level: "A2",
								prompt: "Ticket price:",
								accept: ["15 dollars", "$15", "15"],
							},
						],
					},
				],
			},
			{
				id: "vocab-grammar",
				title: "Grammar & Vocabulary",
				questions: [
					{
						id: "gv-q1",
						kind: "grammar",
						level: "A1",
						prompt: "She ____ to school every day.",
						options: ["go", "goes", "going", "gone"],
						answer: 1,
					},
					{
						id: "gv-q2",
						kind: "vocab",
						level: "B1",
						prompt: "The train was ____ because of heavy rain.",
						options: ["delayed", "arrived", "opened", "built"],
						answer: 0,
					},
				],
			},
			{
				id: "reading",
				title: "Reading",
				passages: [
					{
						id: "rp-1",
						partLabel: "Part 1",
						kind: "sign",
						instruction: "Read the sign.",
						title: "",
						body: "Library closes at 6 p.m. today.",
						questions: [
							{
								id: "r-q1",
								level: "A1",
								prompt: "",
								options: [
									"The library opens late.",
									"The library closes at 6 p.m.",
									"The library is closed all day.",
								],
								answer: 1,
							},
						],
					},
					{
						id: "rp-2",
						partLabel: "Part 4",
						kind: "cloze",
						instruction: "Choose the best word.",
						title: "Healthy Habits",
						body: "Drink water every [1] to stay active.",
						questions: [
							{
								id: "r-q2",
								level: "A2+",
								prompt: "Gap 1",
								options: ["morning", "book", "table", "shoe"],
								answer: 0,
							},
						],
					},
				],
			},
			{
				id: "writing",
				title: "Writing",
				promptTitle: "Write a short email",
				promptBody: "Invite your friend to a weekend picnic.",
				minWords: 50,
				maxWords: 80,
			},
			{
				id: "speaking",
				title: "Speaking",
				tasks: [
					{
						id: "sp-1",
						partLabel: "Part 1",
						level: "A2",
						prompt: "Tell me about your hometown.",
						prepSeconds: 10,
						answerSeconds: 45,
					},
				],
			},
		],
	};
}

test("Bất biến file tĩnh: không chứa '30 câu', không có questions.json tĩnh, đầy đủ UI 5 kỹ năng và màn kết quả Reading/Listening kèm thông báo email", () => {
	const textFiles = walkFiles(publicDir);
	assert.ok(textFiles.length > 0);
	for (const fileUrl of textFiles) {
		const content = readFileSync(fileUrl, "utf8");
		assert.equal(
			/30\s*câu/i.test(content),
			false,
			`${fileUrl.pathname} must not contain '30 câu'`,
		);
		assert.equal(
			content.includes("question-level-pill"),
			false,
			`${fileUrl.pathname} must not contain 'question-level-pill'`,
		);
	}

	assert.equal(
		existsSync(new URL("questions.json", placementDir)),
		false,
		"static questions.json must not exist under apps/profile/public/kiem-tra-dau-vao/",
	);

	const testHtml = readFileSync(new URL("index.html", placementDir), "utf8");
	assert.match(testHtml, /<meta\s+name="lead-api"\s+content="[^"]+"/i);
	assert.match(
		testHtml,
		/<link\s+rel="canonical"\s+href="https:\/\/msmy\.io\.vn\/kiem-tra-dau-vao\/"/i,
	);
	assert.match(testHtml, /id="appRoot"/);
	assert.match(testHtml, /5 Kỹ Năng/i);

	const testJs = readFileSync(new URL("test.js", placementDir), "utf8");
	for (const requiredToken of [
		"Listening",
		"Grammar & Vocab",
		"Reading",
		"Writing",
		"Speaking",
		"40 * 60",
		"/public/placement-test",
		"/public/placement-test/submissions",
		"speaking-media",
		"Hoàn tất nộp bài — Chờ chấm Writing & Speaking",
		"Kết quả Reading & Listening",
		"gửi kết quả chi tiết qua email",
		"email-grading-notice",
		"registerWithResultBtn",
		"speakingPlaybackAudio",
		"video: false",
		"speakingFinishEarlyBtn",
		"speakingReplayPromptBtn",
	]) {
		assert.ok(
			testJs.includes(requiredToken),
			`test.js must include '${requiredToken}'`,
		);
	}
	for (const forbiddenToken of [
		"speakingVideoModeBtn",
		"speakingPlaybackVideo",
		"speakingLiveVideo",
		"Camera + Micro",
		"Phân tích theo từng cấp độ câu hỏi",
		"level-breakdown-section",
		"provisional-hero-grid",
		"objective-average-pct",
		"createCefrExplorer",
		"CEFR_EXPLORER_DATA",
		"cefrExplorerBox",
	]) {
		assert.ok(
			!testJs.includes(forbiddenToken),
			`test.js must NOT include '${forbiddenToken}'`,
		);
	}
});

test("normalizeGapAnswer chuẩn hóa p.m., $, dollars, o'clock, chữ hoa và ký tự thừa", () => {
	assert.equal(normalizeGapAnswer("7:30 p.m."), "730");
	assert.equal(normalizeGapAnswer("7:30 PM"), "730");
	assert.equal(normalizeGapAnswer("7:30 p.m"), "730");
	assert.equal(normalizeGapAnswer("$12.50"), "1250");
	assert.equal(normalizeGapAnswer("15 dollars"), "15");
	assert.equal(normalizeGapAnswer("1 Dollar"), "1");
	assert.equal(normalizeGapAnswer("8 o'clock"), "8");
	assert.equal(normalizeGapAnswer("  Museum Shop! "), "museumshop");
	assert.equal(normalizeGapAnswer(""), "");
	assert.equal(normalizeGapAnswer(null), "");
});

test("countWords đếm đúng số từ với khoảng trắng và xuống dòng", () => {
	assert.equal(countWords(""), 0);
	assert.equal(countWords("   \n\t  "), 0);
	assert.equal(countWords("Hello"), 1);
	assert.equal(countWords("  Dear Anna,\nI would like   to invite you! "), 8);
});

test("matchBandByPct chọn đúng band theo biên %, ngoài biên và fallback khi rỗng", () => {
	const bands = createFiveSkillSnapshotFixture().bands;
	assert.equal(matchBandByPct(0, bands).cefr, "Pre-A1");
	assert.equal(matchBandByPct(24, bands).cefr, "Pre-A1");
	assert.equal(matchBandByPct(25, bands).cefr, "A1");
	assert.equal(matchBandByPct(44, bands).cefr, "A1");
	assert.equal(matchBandByPct(45, bands).cefr, "A2");
	assert.equal(matchBandByPct(64, bands).cefr, "A2");
	assert.equal(matchBandByPct(65, bands).cefr, "A2+");
	assert.equal(matchBandByPct(84, bands).cefr, "A2+");
	assert.equal(matchBandByPct(85, bands).cefr, "B1+");
	assert.equal(matchBandByPct(100, bands).cefr, "B1+");
	assert.equal(matchBandByPct(-10, bands).cefr, "Pre-A1");
	assert.equal(matchBandByPct(120, bands).cefr, "B1+");
	assert.equal(matchBandByPct(50, []).cefr, "A1");
});

test("scoreObjectiveTest chấm cả Listening (MCQ + Gap), Grammar & Vocab, Reading, tính averagePct và byLevel", () => {
	const snapshot = createFiveSkillSnapshotFixture();

	// 100% correct across all 3 parts (including gap variations)
	const fullScore = scoreObjectiveTest(snapshot, {
		listening: {
			"l-q1": 1,
			"l-q2": "7:30 PM",
			"l-q3": "$15",
		},
		vocabGrammar: {
			"gv-q1": 1,
			"gv-q2": 0,
		},
		reading: {
			"r-q1": 1,
			"r-q2": 0,
		},
	});

	assert.deepEqual(fullScore.listening, { correct: 3, total: 3, pct: 100 });
	assert.deepEqual(fullScore.vocabGrammar, { correct: 2, total: 2, pct: 100 });
	assert.deepEqual(fullScore.reading, { correct: 2, total: 2, pct: 100 });
	assert.equal(fullScore.totalCorrect, 7);
	assert.equal(fullScore.totalQuestions, 7);
	assert.equal(fullScore.averagePct, 100);
	assert.equal(fullScore.provisionalBand.cefr, "B1+");

	// Mixed score: Listening 2/3 (67%), GV 1/2 (50%), Reading 1/2 (50%) -> avg = round((67+50+50)/3) = 56% -> A2
	const partialScore = scoreObjectiveTest(snapshot, {
		listening: {
			"l-q1": 1,
			"l-q2": "7:30",
			"l-q3": "wrong",
		},
		vocabGrammar: {
			"gv-q1": 1,
			"gv-q2": 2,
		},
		reading: {
			"r-q1": 1,
			"r-q2": 3,
		},
	});

	assert.deepEqual(partialScore.listening, { correct: 2, total: 3, pct: 67 });
	assert.deepEqual(partialScore.vocabGrammar, {
		correct: 1,
		total: 2,
		pct: 50,
	});
	assert.deepEqual(partialScore.reading, { correct: 1, total: 2, pct: 50 });
	assert.equal(partialScore.totalCorrect, 4);
	assert.equal(partialScore.totalQuestions, 7);
	assert.equal(partialScore.averagePct, 56);
	assert.equal(partialScore.provisionalBand.cefr, "A2");
	assert.deepEqual(partialScore.byLevel, [
		{ level: "A1", correct: 3, total: 3, pct: 100 },
		{ level: "A2", correct: 1, total: 2, pct: 50 },
		{ level: "A2+", correct: 0, total: 1, pct: 0 },
		{ level: "B1", correct: 0, total: 1, pct: 0 },
	]);

	const summary = buildProvisionalSummary(partialScore);
	assert.ok(summary.length > 0 && summary.length <= LEAD_PLACEMENT_MAX);
	assert.match(summary, /Tạm tính A2 \(56%\)/);

	const progress = countObjectiveProgress(snapshot, {
		listening: { "l-q1": 1, "l-q2": "7:30", "l-q3": "   " },
		vocabGrammar: { "gv-q1": 1 },
		reading: {},
	});
	assert.deepEqual(progress, {
		answered: 3,
		total: 7,
		unanswered: 4,
		unansweredByPart: { listening: 1, vocabGrammar: 1, reading: 2 },
	});
});

test("lead-gate.js giữ catalog khóa học, validate form, chuẩn hóa SĐT VN và buildPlacementSubmissionLead", () => {
	assert.ok(PLACEMENT_COURSE_GROUPS.length >= 2);
	assert.ok(PLACEMENT_STUDY_MODES.length >= 2);

	assert.equal(normalizeVietnamPhone("0912345678"), "0912345678");
	assert.equal(normalizeVietnamPhone("+84 912 345 678"), "0912345678");
	assert.equal(normalizeVietnamPhone("84912345678"), "0912345678");
	assert.equal(normalizeVietnamPhone("09123"), null);

	assert.equal(isValidBirthDate("2001-09-15"), true);
	assert.equal(isValidBirthDate("2020-02-30"), false);
	assert.equal(isValidBirthDate("1920-01-01"), false);

	const invalid = validateLeadForm({
		name: "A",
		email: "bad-email",
		phone: "123",
	});
	assert.equal(invalid.ok, false);
	assert.ok(invalid.errors.name);
	assert.ok(invalid.errors.email);
	assert.ok(invalid.errors.phone);

	const validCourse = PLACEMENT_COURSE_GROUPS[0].options[0].value;
	const validMode = PLACEMENT_STUDY_MODES[0].value;
	const valid = validateLeadForm({
		name: "  Nguyễn Minh Anh  ",
		email: "minhanh@example.com",
		phone: "+84912345678",
		birthDate: "2002-05-10",
		course: validCourse,
		studyMode: validMode,
		note: "Cần thi IELTS 6.5",
	});
	assert.equal(valid.ok, true);
	assert.equal(valid.normalized.phone, "0912345678");

	const leadPayload = buildLeadPayload({
		lead: valid.normalized,
		placement: "X".repeat(500),
		elapsedMs: 100,
	});
	assert.equal(leadPayload.source, "placement-test");
	assert.equal(leadPayload.placement.length, LEAD_PLACEMENT_MAX);
	assert.ok(leadPayload.elapsedMs >= LEAD_MIN_SAFE_ELAPSED_MS);

	const submissionLead = buildPlacementSubmissionLead(valid.normalized);
	assert.deepEqual(submissionLead, {
		name: "Nguyễn Minh Anh",
		phone: "0912345678",
		email: "minhanh@example.com",
		birthDate: "2002-05-10",
		note: "Cần thi IELTS 6.5",
	});

	assert.equal(leadErrorMessage(400, { fields: ["phone"] }).kind, "field");
	assert.equal(leadErrorMessage(429).kind, "rate_limit");
	assert.equal(leadErrorMessage(503).kind, "busy");
});

test("serve.mjs thay meta lead-api ở trang chủ & /kiem-tra-dau-vao/, redirect 301 và chặn path traversal", async () => {
	const server = createProfileServer("https://api.staging.test");
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	const base = `http://127.0.0.1:${port}`;

	try {
		const resRedirect = await fetch(`${base}/kiem-tra-dau-vao`, {
			redirect: "manual",
		});
		assert.equal(resRedirect.status, 301);
		assert.equal(resRedirect.headers.get("location"), "/kiem-tra-dau-vao/");

		const resPage = await fetch(`${base}/kiem-tra-dau-vao/`);
		assert.equal(resPage.status, 200);
		const pageHtml = await resPage.text();
		assert.match(
			pageHtml,
			/<meta name="lead-api" content="https:\/\/api\.staging\.test">/,
		);

		const resMissingJson = await fetch(
			`${base}/kiem-tra-dau-vao/questions.json`,
		);
		assert.equal(resMissingJson.status, 404);

		const resTraversal = await fetch(`${base}/%2e%2e/package.json`);
		assert.equal(resTraversal.status >= 400, true);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test("build.mjs copy public sang dist, không có questions.json và thay meta lead-api ở cả hai trang HTML", async () => {
	const tmpRoot = mkdtempSync(join(tmpdir(), "profile-placement-build-"));
	try {
		const distDir = join(tmpRoot, "dist");
		await buildProfile({
			distUrl: pathToFileURL(distDir),
			leadApiUrl: "https://api.prod.test",
		});

		const builtHome = readFileSync(join(distDir, "index.html"), "utf8");
		const builtTest = readFileSync(
			join(distDir, "kiem-tra-dau-vao", "index.html"),
			"utf8",
		);
		assert.match(
			builtHome,
			/<meta name="lead-api" content="https:\/\/api\.prod\.test">/,
		);
		assert.match(
			builtTest,
			/<meta name="lead-api" content="https:\/\/api\.prod\.test">/,
		);
		assert.equal(
			existsSync(join(distDir, "kiem-tra-dau-vao", "questions.json")),
			false,
		);
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
});

test("defensive helpers xử lý Reading/Writing/Speaking rỗng, speakingMode='none' và reload redirect về Reading", () => {
	assert.deepEqual(
		resolveReadingRenderState({ passages: [] }).hasPassages,
		false,
	);
	assert.equal(
		resolveReadingRenderState({ passages: [] }).emptyMessage.length > 0,
		true,
	);
	assert.equal(
		resolveReadingRenderState({ passages: [{ id: "ra", questions: [] }] })
			.hasPassages,
		true,
	);

	const emptyWriting = resolveWritingPromptState({
		promptTitle: "",
		promptBody: "\n  ",
		minWords: 120,
		maxWords: 60,
	});
	assert.equal(emptyWriting.isFallback, true);
	assert.equal(emptyWriting.promptTitle, "Bài viết ngắn");
	assert.equal(emptyWriting.lines.length > 0, true);
	assert.equal(emptyWriting.minWords, 120);
	assert.equal(emptyWriting.maxWords, 120);

	const filledWriting = resolveWritingPromptState({
		promptTitle: "Email to a friend",
		promptBody: "Line 1\n\n  Line 2  ",
		minWords: 50,
		maxWords: 80,
	});
	assert.equal(filledWriting.isFallback, false);
	assert.equal(filledWriting.promptTitle, "Email to a friend");
	assert.deepEqual(filledWriting.lines, ["Line 1", "  Line 2  "]);

	const emptySpeaking = resolveSpeakingStepState({ tasks: [] });
	assert.equal(emptySpeaking.hasTasks, false);
	assert.equal(emptySpeaking.emptyMessage.length > 0, true);
	assert.equal(
		resolveSpeakingStepState({ tasks: [{ id: "s-01" }] }).hasTasks,
		true,
	);

	assert.deepEqual(
		resolveSpeakingSubmitDecision({
			hasSpeakingTasks: false,
			hasValidBlob: true,
			speakingMode: "upload",
		}),
		{ finalMode: "none", needsSpeakingDecision: false },
	);
	assert.deepEqual(
		resolveSpeakingSubmitDecision({
			hasSpeakingTasks: true,
			hasValidBlob: false,
			speakingMode: "none",
		}),
		{ finalMode: "skipped", needsSpeakingDecision: true },
	);
	assert.deepEqual(
		resolveSpeakingSubmitDecision({
			hasSpeakingTasks: true,
			hasValidBlob: false,
			speakingMode: "skipped",
		}),
		{ finalMode: "skipped", needsSpeakingDecision: false },
	);
	assert.deepEqual(
		resolveSpeakingSubmitDecision({
			hasSpeakingTasks: true,
			hasValidBlob: true,
			speakingMode: "upload",
		}),
		{ finalMode: "upload", needsSpeakingDecision: false },
	);

	const noneDisplay = resolveSpeakingStatusDisplay("none");
	const skippedDisplay = resolveSpeakingStatusDisplay("skipped");
	assert.notEqual(noneDisplay.label, skippedDisplay.label);
	assert.equal(skippedDisplay.label, "Đã bỏ qua phần Speaking");
	assert.equal(noneDisplay.badgeClass, "is-muted");
	const uploadedDisplay = resolveSpeakingStatusDisplay("uploaded");
	assert.equal(uploadedDisplay.badgeClass, "is-ok");
	assert.equal(uploadedDisplay.label, "Đã gửi file ghi âm · Chờ cô chấm");
	assert.equal(
		resolveSpeakingStatusDisplay("pending_upload").badgeClass,
		"is-warn",
	);

	const snapshotWithReading = {
		parts: [
			{ id: "listening", clips: [] },
			{ id: "vocab-grammar", questions: [] },
			{
				id: "reading",
				passages: [
					{
						id: "ra",
						questions: [{ id: "r-a1", answer: 1 }],
					},
				],
			},
		],
	};

	assert.deepEqual(
		resolveRestoredAttemptStep("writing", snapshotWithReading, { reading: {} }),
		{ step: "reading", redirectedToReading: true },
	);
	assert.deepEqual(
		resolveRestoredAttemptStep("speaking", snapshotWithReading, {
			reading: { staleKey: 1, "r-a1": null },
		}),
		{ step: "reading", redirectedToReading: true },
	);
	assert.deepEqual(
		resolveRestoredAttemptStep("writing", snapshotWithReading, {
			reading: { "r-a1": 1 },
		}),
		{ step: "writing", redirectedToReading: false },
	);
	assert.deepEqual(
		resolveRestoredAttemptStep("listening", snapshotWithReading, {
			reading: {},
		}),
		{ step: "listening", redirectedToReading: false },
	);
	assert.deepEqual(
		resolveRestoredAttemptStep("result", snapshotWithReading, { reading: {} }),
		{ step: "result", redirectedToReading: false },
	);
	assert.deepEqual(
		resolveRestoredAttemptStep(
			"writing",
			snapshotWithReading,
			{ reading: {} },
			15,
		),
		{ step: "writing", redirectedToReading: false },
	);
	assert.deepEqual(
		resolveRestoredAttemptStep(
			"speaking",
			snapshotWithReading,
			{ reading: {} },
			0,
		),
		{ step: "reading", redirectedToReading: true },
	);
});

test("stripInlineCefrLabel xóa nhãn CEFR trong ngoặc trên tiêu đề nhưng giữ nguyên văn bản thường", () => {
	assert.equal(
		stripInlineCefrLabel("Đoạn nghe 1 (A2) – Thông báo tại thư viện cộng đồng"),
		"Đoạn nghe 1 – Thông báo tại thư viện cộng đồng",
	);
	assert.equal(
		stripInlineCefrLabel(
			"Đoạn nghe 2 (B1) – Hội thoại tư vấn khóa kỹ năng thuyết trình",
		),
		"Đoạn nghe 2 – Hội thoại tư vấn khóa kỹ năng thuyết trình",
	);
	assert.equal(
		stripInlineCefrLabel("Đoạn nghe 4 (B2) – Thảo luận học thuật"),
		"Đoạn nghe 4 – Thảo luận học thuật",
	);
	assert.equal(
		stripInlineCefrLabel("Đoạn nghe 5 (C1) – Bài giảng"),
		"Đoạn nghe 5 – Bài giảng",
	);
	assert.equal(stripInlineCefrLabel("(Pre-A1) Khởi động"), "Khởi động");
	assert.equal(
		stripInlineCefrLabel("Bài đọc [A2+–B1]: Working from home"),
		"Bài đọc: Working from home",
	);
	assert.equal(
		stripInlineCefrLabel("Task (Level A1-A2) — Greeting"),
		"Task — Greeting",
	);
	assert.equal(
		stripInlineCefrLabel("Conversation 1 · Cinema time"),
		"Conversation 1 · Cinema time",
	);
	assert.equal(
		stripInlineCefrLabel("Reading (Part 1): Room 104"),
		"Reading (Part 1): Room 104",
	);
	assert.equal(stripInlineCefrLabel(""), "");
	assert.equal(stripInlineCefrLabel(null), "");
	assert.equal(stripInlineCefrLabel(undefined), "");
});

test("sequential Speaking state machine chuyển pha reading -> prep -> answer 1..N, zero-prep shortcut và giới hạn 1 lượt nghe lại (#727)", () => {
	const tasks = [
		{
			id: "s-1",
			prompt: "Tell me about your hometown.",
			prepSeconds: 10,
			answerSeconds: 30,
		},
		{
			id: "s-2",
			prompt: "What do you do in your free time?",
			prepSeconds: 0,
			answerSeconds: 45,
		},
	];

	assert.deepEqual(resolveTaskTimings(tasks[0]), {
		prepSeconds: 10,
		answerSeconds: 30,
	});
	assert.deepEqual(
		resolveTaskTimings({ prepSeconds: -5, answerSeconds: 999 }),
		{
			prepSeconds: 0,
			answerSeconds: 180,
		},
	);

	const timeoutShort = computeSpeechFallbackTimeoutMs("Hello");
	const timeoutLong = computeSpeechFallbackTimeoutMs("word ".repeat(200));
	assert.equal(timeoutShort >= 4000, true);
	assert.equal(timeoutLong <= 25000, true);

	let session = createInitialSpeakingSession(tasks.length);
	assert.equal(session.status, "idle");
	assert.equal(canReplaySpeakingPrompt(session), false);

	// Câu 1: reading -> prep -> nghe lại 1 lần -> answer sớm -> sang Câu 2
	session = startSpeakingTaskReading(session, 0, tasks);
	assert.equal(session.status, "active");
	assert.equal(session.taskIndex, 0);
	assert.equal(session.phase, "reading");
	assert.equal(canReplaySpeakingPrompt(session), false);

	session = transitionSpeakingAfterReading(session, tasks);
	assert.equal(session.phase, "prep");
	assert.equal(session.secondsLeft, 10);
	assert.equal(canReplaySpeakingPrompt(session), true);

	// Dùng 1 lần nghe lại trong prep -> khóa replay trong câu hiện tại
	session = { ...session, replayUsedForCurrentTask: true };
	assert.equal(canReplaySpeakingPrompt(session), false);

	session = transitionSpeakingToAnswer(session, tasks);
	assert.equal(session.phase, "answer");
	assert.equal(session.secondsLeft, 30);
	assert.equal(canReplaySpeakingPrompt(session), false);

	// Sang Câu 2: reset replay quota; prepSeconds = 0 -> reading đi thẳng tới answer
	session = transitionSpeakingNextTask(session, tasks);
	assert.equal(session.taskIndex, 1);
	assert.equal(session.phase, "reading");
	assert.equal(session.replayUsedForCurrentTask, false);

	session = transitionSpeakingAfterReading(session, tasks);
	assert.equal(session.phase, "answer");
	assert.equal(session.secondsLeft, 45);

	// Hết câu 2 -> completed
	session = transitionSpeakingNextTask(session, tasks);
	assert.equal(session.status, "completed");
	assert.equal(session.phase, "done");
	assert.equal(canReplaySpeakingPrompt(session), false);
});
