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
	canRetrySpeakingTask,
	computeSpeechFallbackTimeoutMs,
	countObjectiveProgress,
	countWords,
	createInitialSpeakingSession,
	LEAD_PLACEMENT_MAX,
	MAX_SPEAKING_RETRIES_PER_TASK,
	matchBandByPct,
	normalizeGapAnswer,
	resolveReadingRenderState,
	resolveRestoredAttemptStep,
	resolveSpeakingStatusDisplay,
	resolveSpeakingStepState,
	resolveSpeakingSubmitDecision,
	resolveTaskTimings,
	resolveWritingPromptState,
	retrySpeakingCurrentTask,
	scoreObjectiveTest,
	startSpeakingTaskReading,
	stripInlineCefrLabel,
	transitionSpeakingAfterReading,
	transitionSpeakingNextTask,
	transitionSpeakingToAnswer,
	transitionSpeakingToPaused,
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
import {
	encodeWavPcm16,
	mergeSpeakingAudioSegments,
	TARGET_SPEAKING_SAMPLE_RATE,
} from "../public/kiem-tra-dau-vao/speaking-audio.js";
import {
	buildGapPromptSegments,
	buildIntroOverviewRows,
	buildSkillReportCards,
	resolveClipDisplayTitle,
	resolvePartHeaderState,
	resolveReadingPassageHeaderState,
	shouldShowReadingTitle,
} from "../public/kiem-tra-dau-vao/test.js";
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
		"speakingPauseBtn",
		"speakingRetryBtn",
		"speakingNextTaskBtn",
		"speakingFinishEarlyBtn",
		"speakingFinishConfirmBox",
		"confirmFinishEarlyBtn",
		"cancelFinishEarlyBtn",
		"speakingReplayPromptBtn",
		"speaking-center-stage",
		"speaking-early-footer",
		"Dừng ghi âm câu hiện tại",
		"Kết thúc phần Speaking",
		"Không dùng từ điển hay công cụ dịch",
		"clip-notes-box",
		"gap-row",
		"skill-progress-track",
		"skill-progress-fill",
		"Đây là kết quả tự động của hai phần nghe và đọc. Cấp độ cuối cùng và lớp phù hợp sẽ được giáo viên báo sau khi chấm Writing và Speaking.",
	]) {
		assert.ok(
			testJs.includes(requiredToken),
			`test.js must include '${requiredToken}'`,
		);
	}
	const testCss = readFileSync(new URL("test.css", placementDir), "utf8");
	for (const requiredCssToken of [
		".intro-overview-table",
		".clip-notes-box",
		".gap-row",
		".reading-body.kind-sign",
		".reading-body.kind-message",
		".skill-progress-track",
		".skill-progress-fill",
		".speaking-center-stage",
		".speaking-pause-circle-btn",
		".speaking-early-footer",
		".speaking-finish-confirm-box",
		"var(--butter)",
		"var(--amber-line)",
		"var(--sky)",
		"var(--blue-line)",
	]) {
		assert.ok(
			testCss.includes(requiredCssToken),
			`test.css must include '${requiredCssToken}'`,
		);
	}
	for (const forbiddenToken of [
		"speakingVideoModeBtn",
		"speakingPlaybackVideo",
		"speakingLiveVideo",
		"Camera + Micro",
		"retakeSpeakingBtn",
		"speaking-overview-steps",
		"Hệ thống sẽ tự động đọc lần lượt từng câu hỏi",
		"Bạn có thể bấm Nghe lại câu hỏi tối đa 1 lần trước khi trả lời.",
		"Phân tích theo từng cấp độ câu hỏi",
		"level-breakdown-section",
		"provisional-hero-grid",
		"objective-average-pct",
		"createCefrExplorer",
		"CEFR_EXPLORER_DATA",
		"cefrExplorerBox",
		"khách quan",
		"READING_KIND_LABELS",
		"Biển báo / Thông báo",
		"Tin nhắn / Email",
		"Bài đọc hiểu",
		"Đoạn văn điền từ",
	]) {
		assert.ok(
			!testJs.includes(forbiddenToken),
			`test.js must NOT include '${forbiddenToken}'`,
		);
	}
	for (const staticRelPath of [
		"index.html",
		"grading.js",
		"lead-gate.js",
		"ket-qua/result.js",
	]) {
		const staticContent = readFileSync(
			new URL(staticRelPath, placementDir),
			"utf8",
		);
		assert.ok(
			!staticContent.toLowerCase().includes("khách quan"),
			`${staticRelPath} must NOT include 'khách quan'`,
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

	assert.deepEqual(fullScore.listening, {
		correct: 3,
		total: 3,
		pct: 100,
		band: matchBandByPct(100, snapshot.bands),
	});
	assert.deepEqual(fullScore.vocabGrammar, { correct: 2, total: 2, pct: 100 });
	assert.deepEqual(fullScore.reading, {
		correct: 2,
		total: 2,
		pct: 100,
		band: matchBandByPct(100, snapshot.bands),
	});
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

	assert.deepEqual(partialScore.listening, {
		correct: 2,
		total: 3,
		pct: 67,
		band: matchBandByPct((2 / 3) * 100, snapshot.bands),
	});
	assert.deepEqual(partialScore.vocabGrammar, {
		correct: 1,
		total: 2,
		pct: 50,
	});
	assert.deepEqual(partialScore.reading, {
		correct: 1,
		total: 2,
		pct: 50,
		band: matchBandByPct(50, snapshot.bands),
	});
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
	const server = createProfileServer("https://api.staging.test", undefined, {
		maintenance: false,
	});
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
			maintenance: false,
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
		}),
		{
			finalMode: "none",
			needsSpeakingDecision: false,
			blockedByMissingSpeaking: false,
		},
	);
	assert.deepEqual(
		resolveSpeakingSubmitDecision({
			hasSpeakingTasks: true,
			hasValidBlob: false,
		}),
		{
			finalMode: null,
			needsSpeakingDecision: false,
			blockedByMissingSpeaking: true,
		},
	);
	assert.deepEqual(
		resolveSpeakingSubmitDecision({
			hasSpeakingTasks: true,
			hasValidBlob: false,
			speakingMode: "skipped",
		}),
		{
			finalMode: null,
			needsSpeakingDecision: false,
			blockedByMissingSpeaking: true,
		},
	);
	assert.deepEqual(
		resolveSpeakingSubmitDecision({
			hasSpeakingTasks: true,
			hasValidBlob: true,
		}),
		{
			finalMode: "upload",
			needsSpeakingDecision: false,
			blockedByMissingSpeaking: false,
		},
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

test("Speaking state machine hỗ trợ pha paused và tối đa 2 lượt ghi lại mỗi câu", () => {
	assert.equal(MAX_SPEAKING_RETRIES_PER_TASK, 2);
	const tasks = [
		{ id: "s-1", prompt: "Q1", prepSeconds: 10, answerSeconds: 30 },
		{ id: "s-2", prompt: "Q2", prepSeconds: 0, answerSeconds: 45 },
	];

	let session = createInitialSpeakingSession(tasks.length);
	assert.equal(session.retriesUsedForCurrentTask, 0);
	assert.equal(canRetrySpeakingTask(session), false);

	session = startSpeakingTaskReading(session, 0, tasks);
	session = transitionSpeakingToAnswer(session, tasks);
	assert.equal(session.phase, "answer");
	assert.equal(canRetrySpeakingTask(session), false);

	// Dừng ghi âm câu 1 -> paused
	session = transitionSpeakingToPaused(session);
	assert.equal(session.phase, "paused");
	assert.equal(session.secondsLeft, 0);
	assert.equal(session.retriesUsedForCurrentTask, 0);
	assert.equal(canRetrySpeakingTask(session), true);

	// Retry lần 1/2
	session = retrySpeakingCurrentTask(session, tasks);
	assert.equal(session.phase, "answer");
	assert.equal(session.secondsLeft, 30);
	assert.equal(session.retriesUsedForCurrentTask, 1);
	assert.equal(canRetrySpeakingTask(session), false);

	session = transitionSpeakingToPaused(session);
	assert.equal(session.phase, "paused");
	assert.equal(canRetrySpeakingTask(session), true);

	// Retry lần 2/2
	session = retrySpeakingCurrentTask(session, tasks);
	assert.equal(session.phase, "answer");
	assert.equal(session.retriesUsedForCurrentTask, 2);

	session = transitionSpeakingToPaused(session);
	assert.equal(session.phase, "paused");
	assert.equal(canRetrySpeakingTask(session), false);

	// Lần 3 bị chặn, state giữ nguyên ở paused
	const blocked = retrySpeakingCurrentTask(session, tasks);
	assert.deepEqual(blocked, session);

	// Sang câu 2 từ paused -> reset retriesUsedForCurrentTask về 0
	session = transitionSpeakingNextTask(session, tasks);
	assert.equal(session.taskIndex, 1);
	assert.equal(session.phase, "reading");
	assert.equal(session.retriesUsedForCurrentTask, 0);

	session = transitionSpeakingAfterReading(session, tasks);
	assert.equal(session.phase, "answer");
	assert.equal(session.secondsLeft, 45);
	session = transitionSpeakingToPaused(session);
	assert.equal(canRetrySpeakingTask(session), true);

	// Hoàn thành từ paused ở câu cuối -> completed
	session = transitionSpeakingNextTask(session, tasks);
	assert.equal(session.status, "completed");
	assert.equal(session.phase, "done");
	assert.equal(canRetrySpeakingTask(session), false);
});

test("mergeSpeakingAudioSegments trả về null/single blob, fallback Blob khi thiếu AudioContext và encode WAV 16kHz mono PCM", async () => {
	assert.equal(await mergeSpeakingAudioSegments([]), null);
	assert.equal(
		await mergeSpeakingAudioSegments([
			{ blob: new Blob([], { type: "audio/webm" }), durationMs: 0 },
		]),
		null,
	);

	const singleBlob = new Blob([new Uint8Array([1, 2, 3, 4])], {
		type: "audio/webm",
	});
	const singleResult = await mergeSpeakingAudioSegments([
		{ blob: singleBlob, durationMs: 1200 },
	]);
	assert.equal(singleResult, singleBlob);

	// Fallback khi globalThis.AudioContext không tồn tại
	const prevAudioContext = globalThis.AudioContext;
	const prevWebkitAudioContext = globalThis.webkitAudioContext;
	delete globalThis.AudioContext;
	delete globalThis.webkitAudioContext;

	try {
		const b1 = new Blob([new Uint8Array([10, 20])], { type: "audio/webm" });
		const b2 = new Blob([new Uint8Array([30, 40, 50])], { type: "audio/webm" });
		const fallbackBlob = await mergeSpeakingAudioSegments([
			{ blob: b1, durationMs: 500 },
			{ blob: b2, durationMs: 500 },
		]);
		assert.ok(fallbackBlob instanceof Blob);
		assert.equal(fallbackBlob.type, "audio/webm");
		assert.equal(fallbackBlob.size, 5);

		// WAV encoding trực tiếp
		const wavBuf = encodeWavPcm16(
			new Float32Array([0, 0.5, -0.5, 1, -1]),
			TARGET_SPEAKING_SAMPLE_RATE,
		);
		const view = new DataView(wavBuf);
		assert.equal(String.fromCharCode(...new Uint8Array(wavBuf, 0, 4)), "RIFF");
		assert.equal(String.fromCharCode(...new Uint8Array(wavBuf, 8, 4)), "WAVE");
		assert.equal(String.fromCharCode(...new Uint8Array(wavBuf, 12, 4)), "fmt ");
		assert.equal(view.getUint16(20, true), 1); // PCM
		assert.equal(view.getUint16(22, true), 1); // mono
		assert.equal(view.getUint32(24, true), 16000);
		assert.equal(view.getUint16(34, true), 16);
		assert.equal(String.fromCharCode(...new Uint8Array(wavBuf, 36, 4)), "data");
		assert.equal(view.getUint32(40, true), 10);

		// Khi AudioContext khả dụng -> decode & merge thành audio/wav
		let closedCount = 0;
		let decodeCallCount = 0;
		globalThis.AudioContext = class MockAudioContext {
			async decodeAudioData() {
				decodeCallCount += 1;
				if (decodeCallCount === 1) {
					return {
						sampleRate: 16000,
						numberOfChannels: 1,
						length: 4,
						duration: 4 / 16000,
						getChannelData: () => new Float32Array([0.1, 0.2, 0.3, 0.4]),
					};
				}
				return {
					sampleRate: 32000,
					numberOfChannels: 2,
					length: 4,
					duration: 4 / 32000,
					getChannelData: (ch) =>
						ch === 0
							? new Float32Array([0.2, 0.2, 0.4, 0.4])
							: new Float32Array([0.4, 0.4, 0.6, 0.6]),
				};
			}
			async close() {
				closedCount += 1;
			}
		};

		const wavBlob = await mergeSpeakingAudioSegments([
			{ blob: b1, durationMs: 1000 },
			{ blob: b2, durationMs: 1000 },
		]);
		assert.equal(wavBlob.type, "audio/wav");
		assert.equal(closedCount, 1);
		const mergedBytes = await wavBlob.arrayBuffer();
		const mergedView = new DataView(mergedBytes);
		assert.equal(
			String.fromCharCode(...new Uint8Array(mergedBytes, 0, 4)),
			"RIFF",
		);
		assert.equal(mergedView.getUint32(24, true), 16000);
		// 4 samples + 2 resampled samples (4 @ 32kHz -> 2 @ 16kHz) = 6 samples = 12 bytes
		assert.equal(mergedView.getUint32(40, true), 12);

		// Khi decodeAudioData lỗi -> fallback an toàn & vẫn đóng AudioContext
		globalThis.AudioContext = class FailingAudioContext {
			async decodeAudioData() {
				throw new Error("decode error");
			}
			async close() {
				closedCount += 1;
			}
		};
		const safeFallback = await mergeSpeakingAudioSegments([
			{ blob: b1, durationMs: 500 },
			{ blob: b2, durationMs: 500 },
		]);
		assert.equal(safeFallback.type, "audio/webm");
		assert.equal(safeFallback.size, 5);
		assert.equal(closedCount, 2);
	} finally {
		if (prevAudioContext === undefined) {
			delete globalThis.AudioContext;
		} else {
			globalThis.AudioContext = prevAudioContext;
		}
		if (prevWebkitAudioContext === undefined) {
			delete globalThis.webkitAudioContext;
		} else {
			globalThis.webkitAudioContext = prevWebkitAudioContext;
		}
	}
});

test("buildIntroOverviewRows trả về bảng 5 phần theo snapshot và fallback chuẩn", () => {
	const fallbackRows = buildIntroOverviewRows({});
	assert.deepEqual(fallbackRows, [
		{
			id: "listening",
			part: "1. Listening",
			content: "3 parts · 13 câu · mỗi đoạn nghe 2 lần",
			time: "~10 phút",
		},
		{
			id: "vocab-grammar",
			part: "2. Grammar & Vocabulary",
			content: "12 câu trắc nghiệm, từ dễ đến khó",
			time: "~6 phút",
		},
		{
			id: "reading",
			part: "3. Reading",
			content: "3 parts · 15 câu",
			time: "~12 phút",
		},
		{
			id: "writing",
			part: "4. Writing",
			content: "1 email 50–80 từ",
			time: "~10 phút",
		},
		{
			id: "speaking",
			part: "5. Speaking",
			content: "8 câu hỏi ghi âm qua micro",
			time: "~7 phút",
		},
	]);

	const customFixture = createFiveSkillSnapshotFixture();
	const customSnapshot = {
		listening: {
			...customFixture.parts[0],
			estimatedMinutes: 8,
		},
		vocabGrammar: {
			...customFixture.parts[1],
			estimatedMinutes: 5,
		},
		reading: {
			...customFixture.parts[2],
			estimatedMinutes: 9,
		},
		writing: {
			...customFixture.parts[3],
			minWords: 60,
			maxWords: 100,
			estimatedMinutes: 11,
		},
		speaking: {
			...customFixture.parts[4],
			estimatedMinutes: 4,
		},
	};
	const dynamicRows = buildIntroOverviewRows(customSnapshot);
	assert.deepEqual(dynamicRows, [
		{
			id: "listening",
			part: "1. Listening",
			content: "2 parts · 3 câu · mỗi đoạn nghe 2 lần",
			time: "~8 phút",
		},
		{
			id: "vocab-grammar",
			part: "2. Grammar & Vocabulary",
			content: "2 câu trắc nghiệm, từ dễ đến khó",
			time: "~5 phút",
		},
		{
			id: "reading",
			part: "3. Reading",
			content: "2 parts · 2 câu",
			time: "~9 phút",
		},
		{
			id: "writing",
			part: "4. Writing",
			content: "1 email 60–100 từ",
			time: "~11 phút",
		},
		{
			id: "speaking",
			part: "5. Speaking",
			content: "1 câu hỏi ghi âm qua micro",
			time: "~4 phút",
		},
	]);
});

test("resolvePartHeaderState, resolveClipDisplayTitle, buildGapPromptSegments và shouldShowReadingTitle đồng bộ hiển thị Listening & Reading", () => {
	const clip1 = {
		id: "clip-la",
		partLabel: "Part 1",
		instruction: "For each question, choose the correct answer.",
		title: "Conversation 1 · Cinema time",
	};
	const clip2 = {
		id: "clip-lb",
		partLabel: "Part 1",
		instruction: "",
		title: "Conversation 2 · Going to work",
	};
	const clip2SameInstr = {
		id: "clip-lc",
		partLabel: "Part 1",
		instruction: "For each question, choose the correct answer.",
		title: "Conversation 3 · Ordering lunch",
	};
	const clip2DiffInstr = {
		id: "clip-ld",
		partLabel: "Part 1",
		instruction: "Listen carefully to the announcement.",
		title: "Conversation 4",
	};
	const clipPart2 = {
		id: "clip-le",
		partLabel: "Part 2",
		instruction: "Write ONE word or a number.",
		title: "Phone message · Evening English Course",
	};

	assert.deepEqual(resolvePartHeaderState(clip1, null), {
		partLabel: "Part 1",
		instruction: "For each question, choose the correct answer.",
		showPartLabel: true,
		showInstruction: true,
	});
	assert.deepEqual(resolvePartHeaderState(clip2, clip1), {
		partLabel: "Part 1",
		instruction: "",
		showPartLabel: false,
		showInstruction: false,
	});
	assert.deepEqual(resolvePartHeaderState(clip2SameInstr, clip1), {
		partLabel: "Part 1",
		instruction: "For each question, choose the correct answer.",
		showPartLabel: false,
		showInstruction: false,
	});
	assert.deepEqual(resolvePartHeaderState(clip2DiffInstr, clip1), {
		partLabel: "Part 1",
		instruction: "Listen carefully to the announcement.",
		showPartLabel: false,
		showInstruction: true,
	});
	assert.deepEqual(resolvePartHeaderState(clipPart2, clip2), {
		partLabel: "Part 2",
		instruction: "Write ONE word or a number.",
		showPartLabel: true,
		showInstruction: true,
	});

	// Neutral clip label when partLabel is present; preserve legacy title when partLabel is absent
	assert.equal(resolveClipDisplayTitle(clip1, 0), "Đoạn nghe 1");
	assert.equal(resolveClipDisplayTitle(clipPart2, 4), "Đoạn nghe 5");
	assert.equal(
		resolveClipDisplayTitle(
			{ id: "v1-1", partLabel: "", title: "Đoạn nghe 1 (A2) – Thư viện" },
			0,
		),
		"Đoạn nghe 1 – Thư viện",
	);

	assert.deepEqual(buildGapPromptSegments("Start date: Monday ____ March"), [
		{ type: "text", value: "Start date: Monday " },
		{ type: "gap" },
		{ type: "text", value: " March" },
	]);
	assert.deepEqual(buildGapPromptSegments("Price: $ ____"), [
		{ type: "text", value: "Price: $ " },
		{ type: "gap" },
	]);
	assert.deepEqual(buildGapPromptSegments(""), [
		{ type: "text", value: "Điền thông tin nghe được vào chỗ trống:" },
	]);

	assert.equal(
		shouldShowReadingTitle({ kind: "sign", title: "CITY POOL" }),
		false,
	);
	assert.equal(
		shouldShowReadingTitle({ kind: "message", title: "Message from Mum" }),
		false,
	);
	assert.equal(
		shouldShowReadingTitle({
			kind: "passage",
			title: "A new start in Auckland",
		}),
		true,
	);
	assert.equal(
		shouldShowReadingTitle({ kind: "cloze", title: "Working from home" }),
		true,
	);
});

test("buildSkillReportCards chỉ hiển thị 2 thẻ Listening & Reading kèm CEFR riêng, % đúng và thanh tiến độ", () => {
	const bands = createFiveSkillSnapshotFixture().bands;

	// Case 1: objective from client scoreObjectiveTest (already has .band)
	const clientObjective = scoreObjectiveTest(createFiveSkillSnapshotFixture(), {
		listening: { "l-q1": 1, "l-q2": "7:30 p.m.", "l-q3": "wrong" }, // 2/3 -> 66.67% -> A2+
		vocabGrammar: { "gv-q1": 1, "gv-q2": 0 },
		reading: { "r-q1": 1, "r-q2": 3 }, // 1/2 -> 50% -> A2
	});
	const clientCards = buildSkillReportCards(clientObjective, bands);
	assert.equal(clientCards.length, 2);
	assert.deepEqual(clientCards, [
		{
			key: "listening",
			label: "Listening",
			cefr: "A2+",
			scoreText: "2/3 câu đúng · 67%",
			progressPct: 67,
		},
		{
			key: "reading",
			label: "Reading",
			cefr: "A2",
			scoreText: "1/2 câu đúng · 50%",
			progressPct: 50,
		},
	]);

	// Case 2: objective from server submission response (without .band on listening/reading)
	const serverObjective = {
		listening: { correct: 13, total: 13, pct: 100 },
		vocabGrammar: { correct: 9, total: 12, pct: 75 },
		reading: { correct: 5, total: 15, pct: 33 },
	};
	const serverCards = buildSkillReportCards(serverObjective, bands);
	assert.equal(serverCards.length, 2);
	assert.deepEqual(serverCards, [
		{
			key: "listening",
			label: "Listening",
			cefr: "B1+",
			scoreText: "13/13 câu đúng · 100%",
			progressPct: 100,
		},
		{
			key: "reading",
			label: "Reading",
			cefr: "A1",
			scoreText: "5/15 câu đúng · 33%",
			progressPct: 33,
		},
	]);
});

test("resolveReadingPassageHeaderState ẩn .clip-badges và .passage-header khi không có partLabel, title hay instruction", () => {
	const ra = {
		id: "ra",
		partLabel: "Part 1",
		kind: "sign",
		instruction: "For each question, choose the correct answer.",
		title: "Pool Notice",
	};
	const rb = {
		id: "rb",
		partLabel: "Part 1",
		kind: "message",
		instruction: "For each question, choose the correct answer.",
		title: "Message from Mum",
	};
	const re = {
		id: "re",
		partLabel: "Part 2",
		kind: "passage",
		instruction: "Read the article.",
		title: "A new start in Auckland (A2)",
	};
	const rf = {
		id: "rf",
		partLabel: "Part 2",
		kind: "cloze",
		instruction: "Read the article.",
		title: "(B1)",
	};

	assert.deepEqual(resolveReadingPassageHeaderState(ra, null), {
		partLabel: "Part 1",
		instruction: "For each question, choose the correct answer.",
		displayTitle: "",
		showPartLabel: true,
		showInstruction: true,
		showBadges: true,
		hasHeader: true,
	});
	assert.deepEqual(resolveReadingPassageHeaderState(rb, ra), {
		partLabel: "Part 1",
		instruction: "For each question, choose the correct answer.",
		displayTitle: "",
		showPartLabel: false,
		showInstruction: false,
		showBadges: false,
		hasHeader: false,
	});
	assert.deepEqual(resolveReadingPassageHeaderState(re, rb), {
		partLabel: "Part 2",
		instruction: "Read the article.",
		displayTitle: "A new start in Auckland",
		showPartLabel: true,
		showInstruction: true,
		showBadges: true,
		hasHeader: true,
	});
	assert.deepEqual(resolveReadingPassageHeaderState(rf, re), {
		partLabel: "Part 2",
		instruction: "Read the article.",
		displayTitle: "",
		showPartLabel: false,
		showInstruction: false,
		showBadges: false,
		hasHeader: false,
	});
});
