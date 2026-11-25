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
	detectSpeakingAudioMimeFromBytes,
	isLikelyInAppBrowser,
	isRetryableSpeakingUploadError,
	LEAD_PLACEMENT_MAX,
	MAX_SPEAKING_RETRIES_PER_TASK,
	matchBandByPct,
	normalizeGapAnswer,
	resolveReadingRenderState,
	resolveRestoredAttemptStep,
	resolveSpeakingStatusDisplay,
	resolveSpeakingStepState,
	resolveSpeakingSubmitDecision,
	resolveSpeakingUploadMeta,
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
	buildSkillRubricDisplay,
	isIeltsSpeakingRubric,
	isIeltsWritingRubric,
	PLACEMENT_LEGACY_SPEAKING_RUBRIC,
	PLACEMENT_LEGACY_WRITING_RUBRIC,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
} from "../public/kiem-tra-dau-vao/ket-qua/highlight.js";
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
	readBlobArrayBuffer,
	TARGET_SPEAKING_SAMPLE_RATE,
} from "../public/kiem-tra-dau-vao/speaking-audio.js";
import {
	buildGapPromptSegments,
	buildIntroOverviewRows,
	buildSkillReportCards,
	deleteSpeakingBackup,
	loadSpeakingBackup,
	resolveClipDisplayTitle,
	resolvePartHeaderState,
	resolveReadingPassageHeaderState,
	saveSpeakingBackup,
	shouldShowReadingTitle,
	uploadSpeakingMediaWithRetry,
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

test("ket-qua/highlight.js hỗ trợ hiển thị cả IELTS 0–9 lẫn fallback legacy /15 & /20", () => {
	assert.deepEqual(
		PLACEMENT_WRITING_RUBRIC.map((r) => r.key),
		["task", "coherence", "lexical", "grammar"],
	);
	assert.deepEqual(
		PLACEMENT_SPEAKING_RUBRIC.map((r) => r.key),
		["fluency", "lexical", "grammar", "pronunciation"],
	);
	assert.deepEqual(
		PLACEMENT_LEGACY_WRITING_RUBRIC.map((r) => r.key),
		["ct", "or", "lg"],
	);
	assert.deepEqual(
		PLACEMENT_LEGACY_SPEAKING_RUBRIC.map((r) => r.key),
		["gv", "dm", "pr", "ic"],
	);

	assert.equal(
		isIeltsWritingRubric({
			task: 6.5,
			coherence: 6,
			lexical: 6.5,
			grammar: 6,
		}),
		true,
	);
	assert.equal(isIeltsWritingRubric({ ct: 4, or: 4, lg: 3 }), false);
	assert.equal(
		isIeltsSpeakingRubric({
			fluency: 7,
			lexical: 6.5,
			grammar: 6,
			pronunciation: 7,
		}),
		true,
	);
	assert.equal(isIeltsSpeakingRubric({ gv: 4, dm: 4, pr: 4, ic: 5 }), false);

	const ieltsWriting = buildSkillRubricDisplay("writing", 6.5, {
		task: 6.5,
		coherence: 6,
		lexical: 6.5,
		grammar: 6,
	});
	assert.equal(ieltsWriting.isIelts, true);
	assert.equal(ieltsWriting.totalText, "Writing: Band 6.5/9");
	assert.deepEqual(
		ieltsWriting.criteria.map((c) => [c.label, c.valueText]),
		[
			["Task Response", "6.5/9"],
			["Coherence & Cohesion", "6.0/9"],
			["Lexical Resource", "6.5/9"],
			["Grammatical Range & Accuracy", "6.0/9"],
		],
	);

	const legacyWriting = buildSkillRubricDisplay("writing", 11, {
		ct: 4,
		or: 4,
		lg: 3,
	});
	assert.equal(legacyWriting.isIelts, false);
	assert.equal(legacyWriting.totalText, "Writing: 11/15");
	assert.deepEqual(
		legacyWriting.criteria.map((c) => [c.label, c.valueText]),
		[
			["Content", "4/5"],
			["Organisation", "4/5"],
			["Language", "3/5"],
		],
	);

	const ieltsSpeaking = buildSkillRubricDisplay("speaking", 7, {
		fluency: 7,
		lexical: 6.5,
		grammar: 7,
		pronunciation: 7,
	});
	assert.equal(ieltsSpeaking.isIelts, true);
	assert.equal(ieltsSpeaking.totalText, "Speaking: Band 7.0/9");
	assert.deepEqual(
		ieltsSpeaking.criteria.map((c) => [c.label, c.valueText]),
		[
			["Fluency & Coherence", "7.0/9"],
			["Lexical Resource", "6.5/9"],
			["Grammatical Range & Accuracy", "7.0/9"],
			["Pronunciation", "7.0/9"],
		],
	);

	const legacySpeaking = buildSkillRubricDisplay("speaking", 17, {
		gv: 4,
		dm: 4,
		pr: 4,
		ic: 5,
	});
	assert.equal(legacySpeaking.isIelts, false);
	assert.equal(legacySpeaking.totalText, "Speaking: 17/20");
	assert.deepEqual(
		legacySpeaking.criteria.map((c) => [c.label, c.valueText]),
		[
			["Grammar & Vocabulary", "4/5"],
			["Discourse Management", "4/5"],
			["Pronunciation", "4/5"],
			["Task Response", "5/5"],
		],
	);

	const resultJs = readFileSync(
		new URL("ket-qua/result.js", placementDir),
		"utf8",
	);
	assert.ok(resultJs.includes("buildSkillRubricDisplay"));
	const highlightJs = readFileSync(
		new URL("ket-qua/highlight.js", placementDir),
		"utf8",
	);
	assert.ok(!highlightJs.toLowerCase().includes("khách quan"));
});

function buildFtypBytes(brand, { extendedSize = false } = {}) {
	if (extendedSize) {
		const buf = new Uint8Array(24);
		buf[3] = 1; // 64-bit size marker
		buf.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
		buf[15] = 24; // 64-bit size = 24
		for (let i = 0; i < 4; i += 1) {
			buf[16 + i] = brand.charCodeAt(i);
		}
		return buf;
	}
	const buf = new Uint8Array(20);
	buf[3] = 20;
	buf.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
	for (let i = 0; i < 4; i += 1) {
		buf[8 + i] = brand.charCodeAt(i);
	}
	return buf;
}

test("detectSpeakingAudioMimeFromBytes recognizes WAV, MP4, WebM, OGG, MP3, AAC and rejects image/unknown bytes", () => {
	const wavBuf = encodeWavPcm16(new Float32Array([0, 0.25]), 16000);
	assert.equal(detectSpeakingAudioMimeFromBytes(wavBuf), "audio/wav");
	assert.equal(
		detectSpeakingAudioMimeFromBytes(new Uint8Array(wavBuf)),
		"audio/wav",
	);

	const rf64Wav = new Uint8Array(20);
	rf64Wav.set([0x52, 0x46, 0x36, 0x34], 0); // "RF64"
	rf64Wav.set([0xff, 0xff, 0xff, 0xff], 4);
	rf64Wav.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
	assert.equal(detectSpeakingAudioMimeFromBytes(rf64Wav), "audio/wav");

	assert.equal(
		detectSpeakingAudioMimeFromBytes(buildFtypBytes("M4A ")),
		"audio/mp4",
	);
	assert.equal(
		detectSpeakingAudioMimeFromBytes(buildFtypBytes("isom")),
		"audio/mp4",
	);
	assert.equal(
		detectSpeakingAudioMimeFromBytes(
			buildFtypBytes("mp42", { extendedSize: true }),
		),
		"audio/mp4",
	);

	for (const imageBrand of [
		"heic",
		"heix",
		"hevc",
		"hevx",
		"mif1",
		"msf1",
		"avif",
		"avis",
		"jp2 ",
	]) {
		assert.equal(
			detectSpeakingAudioMimeFromBytes(buildFtypBytes(imageBrand)),
			null,
			`image ftyp brand '${imageBrand}' must not be detected as audio/mp4`,
		);
	}

	const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
	assert.equal(detectSpeakingAudioMimeFromBytes(webm), "audio/webm");

	const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]);
	assert.equal(detectSpeakingAudioMimeFromBytes(ogg), "audio/ogg");

	const mp3Id3 = new Uint8Array([
		0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	]);
	assert.equal(detectSpeakingAudioMimeFromBytes(mp3Id3), "audio/mpeg");

	const mp3Sync = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
	assert.equal(detectSpeakingAudioMimeFromBytes(mp3Sync), "audio/mpeg");

	const aacAdts = new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0x01, 0x7f, 0xfc]);
	assert.equal(detectSpeakingAudioMimeFromBytes(aacAdts), "audio/aac");

	assert.equal(
		detectSpeakingAudioMimeFromBytes(new Uint8Array([1, 2, 3, 4])),
		null,
	);
	assert.equal(
		detectSpeakingAudioMimeFromBytes(
			new TextEncoder().encode("<html>hi</html>"),
		),
		null,
	);
	assert.equal(detectSpeakingAudioMimeFromBytes(null), null);
	assert.equal(detectSpeakingAudioMimeFromBytes(new Uint8Array(0)), null);
});

test("resolveSpeakingUploadMeta normalizes MIME aliases and overrides mislabeled blob types from magic bytes", () => {
	assert.deepEqual(resolveSpeakingUploadMeta("video/mp4"), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/x-m4a"), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/mp4a-latm"), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/wave"), {
		contentType: "audio/wav",
		filename: "speaking.wav",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/vnd.wave"), {
		contentType: "audio/wav",
		filename: "speaking.wav",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/opus"), {
		contentType: "audio/ogg",
		filename: "speaking.ogg",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("application/ogg"), {
		contentType: "audio/ogg",
		filename: "speaking.ogg",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/x-mpeg-3"), {
		contentType: "audio/mpeg",
		filename: "speaking.mp3",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("audio/adts"), {
		contentType: "audio/aac",
		filename: "speaking.aac",
	});
	assert.deepEqual(resolveSpeakingUploadMeta(""), {
		contentType: "audio/webm",
		filename: "speaking.webm",
	});

	// Magic-byte sniffing overrides mislabeled WebKit/empty blob types
	const mp4Head = buildFtypBytes("M4A ");
	assert.deepEqual(resolveSpeakingUploadMeta("audio/webm", mp4Head), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("", mp4Head), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});
	assert.deepEqual(resolveSpeakingUploadMeta("video/mp4", mp4Head), {
		contentType: "audio/mp4",
		filename: "speaking.m4a",
	});

	// Unknown magic bytes fall back to declared blob type
	assert.deepEqual(
		resolveSpeakingUploadMeta("audio/x-m4a", new Uint8Array([0, 1, 2, 3])),
		{
			contentType: "audio/mp4",
			filename: "speaking.m4a",
		},
	);
});

test("isLikelyInAppBrowser detects mobile social WebViews and excludes standard Safari/Chrome UAs", () => {
	for (const ua of [
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Zalo/24.03.01",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/450.0.0]",
		"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 FB_IAB/FB4A;FBAV/450.0",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 MessengerLiteForiOS",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 Instagram 325.0.0",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 Line/14.2.0",
		"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 BytedanceWebview/d8a21c6",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 musical_ly_34.0.0",
		"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 TikTok 34.0.0",
	]) {
		assert.equal(
			isLikelyInAppBrowser(ua),
			true,
			`expected in-app match: ${ua}`,
		);
	}

	for (const ua of [
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		"",
		null,
	]) {
		assert.equal(
			isLikelyInAppBrowser(ua),
			false,
			`expected normal browser UA: ${ua}`,
		);
	}
});

test("isRetryableSpeakingUploadError retries only network, 408, 429 and 5xx errors", () => {
	for (const retryable of [0, null, undefined, 408, 429, 500, 502, 503, 504]) {
		assert.equal(
			isRetryableSpeakingUploadError(retryable),
			true,
			`status ${retryable} should be retryable`,
		);
	}
	for (const nonRetryable of [200, 400, 401, 403, 404, 409, 413, 415, 422]) {
		assert.equal(
			isRetryableSpeakingUploadError(nonRetryable),
			false,
			`status ${nonRetryable} should not be retryable`,
		);
	}
});

test("mergeSpeakingAudioSegments preserves MP4 magic-byte type without forcing audio/webm and supports arrayBuffer fallback", async () => {
	const prevAudioContext = globalThis.AudioContext;
	const prevWebkitAudioContext = globalThis.webkitAudioContext;
	delete globalThis.AudioContext;
	delete globalThis.webkitAudioContext;

	try {
		const mp4Head = buildFtypBytes("M4A ");
		const singleEmptyTypeMp4 = new Blob([mp4Head]);
		const singleMerged = await mergeSpeakingAudioSegments([
			{ blob: singleEmptyTypeMp4, durationMs: 1000 },
		]);
		assert.equal(singleMerged.type, "audio/mp4");

		const mp4Seg1 = new Blob([mp4Head]);
		const mp4Seg2 = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])]);
		const fallbackMp4 = await mergeSpeakingAudioSegments([
			{ blob: mp4Seg1, durationMs: 800 },
			{ blob: mp4Seg2, durationMs: 800 },
		]);
		assert.equal(fallbackMp4.type, "audio/mp4");

		const unknownSeg1 = new Blob([new Uint8Array([1, 2, 3, 4])]);
		const unknownSeg2 = new Blob([new Uint8Array([5, 6, 7, 8])]);
		const fallbackUnknown = await mergeSpeakingAudioSegments([
			{ blob: unknownSeg1, durationMs: 500 },
			{ blob: unknownSeg2, durationMs: 500 },
		]);
		assert.equal(fallbackUnknown.type, "");

		// Verify readBlobArrayBuffer falls back cleanly when blob.arrayBuffer is absent
		const legacyBlob = new Blob([new Uint8Array([9, 8, 7, 6])]);
		Object.defineProperty(legacyBlob, "arrayBuffer", { value: undefined });
		const buf = await readBlobArrayBuffer(legacyBlob);
		assert.deepEqual(Array.from(new Uint8Array(buf)), [9, 8, 7, 6]);
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

test("uploadSpeakingMediaWithRetry sniffs magic bytes, retries transient failures with backoff, and stops immediately on 4xx", async () => {
	const mp4Blob = new Blob([buildFtypBytes("M4A ")], { type: "audio/webm" });
	const observedHeaders = [];
	const delays = [];
	let attempts = 0;

	const result = await uploadSpeakingMediaWithRetry({
		apiBase: "https://api.example.test",
		submissionId: "sub-123",
		uploadToken: "tok-abc",
		blob: mp4Blob,
		durationSec: 42,
		sleepImpl: async (ms) => {
			delays.push(ms);
		},
		fetchImpl: async (_url, init) => {
			attempts += 1;
			observedHeaders.push(init.headers);
			if (attempts === 1) {
				throw new TypeError("Failed to fetch");
			}
			if (attempts === 2) {
				return new Response(JSON.stringify({ error: "SERVER_BUSY" }), {
					status: 503,
					headers: { "Content-Type": "application/json" },
				});
			}
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	});

	assert.deepEqual(result, { ok: true });
	assert.equal(attempts, 3);
	assert.deepEqual(delays, [800, 2000]);
	assert.equal(observedHeaders[0]["Content-Type"], "audio/mp4");
	assert.equal(observedHeaders[0]["X-Media-Filename"], "speaking.m4a");
	assert.equal(observedHeaders[0]["X-Speaking-Duration"], "42");

	// Non-retryable 415 must fail immediately without retry
	let nonRetryAttempts = 0;
	const nonRetryDelays = [];
	await assert.rejects(
		uploadSpeakingMediaWithRetry({
			apiBase: "https://api.example.test",
			submissionId: "sub-415",
			uploadToken: "tok-abc",
			blob: mp4Blob,
			durationSec: 12,
			sleepImpl: async (ms) => {
				nonRetryDelays.push(ms);
			},
			fetchImpl: async () => {
				nonRetryAttempts += 1;
				return new Response(JSON.stringify({ error: "UNSUPPORTED_MEDIA" }), {
					status: 415,
					headers: { "Content-Type": "application/json" },
				});
			},
		}),
		/UNSUPPORTED_MEDIA/,
	);
	assert.equal(nonRetryAttempts, 1);
	assert.deepEqual(nonRetryDelays, []);
});

test("IndexedDB speaking backup fails open when unavailable and respects 15-minute TTL", async () => {
	const blob = new Blob([buildFtypBytes("M4A ")], { type: "audio/mp4" });

	// Fail-open when indexedDB is missing or throws
	assert.equal(
		await saveSpeakingBackup({
			submissionId: "sub-none",
			blob,
			mimeType: "audio/mp4",
			durationSec: 20,
			idbFactory: null,
		}),
		false,
	);
	assert.equal(
		await loadSpeakingBackup("sub-none", { idbFactory: null }),
		null,
	);
	assert.equal(
		await deleteSpeakingBackup("sub-none", {
			idbFactory: {
				open() {
					throw new Error("SecurityError");
				},
			},
		}),
		false,
	);

	// Round-trip save, load within TTL, expire after TTL, and delete
	const records = new Map();
	const fakeIdb = {
		open() {
			const openReq = { result: null };
			queueMicrotask(() => {
				const db = {
					objectStoreNames: { contains: () => true },
					createObjectStore() {},
					close() {},
					transaction() {
						const tx = {};
						return {
							objectStore() {
								return {
									put(val) {
										const req = {};
										records.set(val.submissionId, val);
										queueMicrotask(() => {
											req.onsuccess?.();
											tx.oncomplete?.();
										});
										return req;
									},
									get(key) {
										const req = { result: records.get(key) };
										queueMicrotask(() => {
											req.onsuccess?.();
											tx.oncomplete?.();
										});
										return req;
									},
									delete(key) {
										const req = {};
										records.delete(key);
										queueMicrotask(() => {
											req.onsuccess?.();
											tx.oncomplete?.();
										});
										return req;
									},
								};
							},
							set oncomplete(fn) {
								tx.oncomplete = fn;
							},
							set onerror(fn) {
								tx.onerror = fn;
							},
							set onabort(fn) {
								tx.onabort = fn;
							},
						};
					},
				};
				openReq.result = db;
				openReq.onupgradeneeded?.();
				openReq.onsuccess?.();
			});
			return openReq;
		},
	};

	const t0 = 1_700_000_000_000;
	const saved = await saveSpeakingBackup({
		submissionId: "sub-1",
		blob,
		mimeType: "audio/mp4",
		durationSec: 35,
		now: t0,
		idbFactory: fakeIdb,
	});
	assert.equal(saved, true);

	const restored = await loadSpeakingBackup("sub-1", {
		now: t0 + 5 * 60 * 1000,
		idbFactory: fakeIdb,
	});
	assert.ok(restored);
	assert.equal(restored.submissionId, "sub-1");
	assert.equal(restored.durationSec, 35);
	assert.equal(restored.mimeType, "audio/mp4");
	assert.equal(restored.blob.size, blob.size);

	// Past 15m TTL -> returns null and clears expired entry
	const expired = await loadSpeakingBackup("sub-1", {
		now: t0 + 16 * 60 * 1000,
		idbFactory: fakeIdb,
	});
	assert.equal(expired, null);
	assert.equal(records.has("sub-1"), false);
});
