import fs from "node:fs/promises";
import path from "node:path";
import type {
	PlacementError,
	PlacementSnapshot,
	PlacementSubmissionDetail,
} from "@teacher-os/api/placement-test-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildPlacementPdfFilename,
	buildPlacementResultDocDefinition,
	buildPlacementResultPdfModel,
	exportPlacementResultPdf,
	generatePlacementResultPdfBytes,
} from "./placement-result-pdf";
import {
	formatPlacementPdfDate,
	PDF_DEFAULT_FILENAME,
	PDF_EMPTY_WRITING_TEXT,
	PDF_NO_ERRORS_TEXT,
	PDF_SKIPPED_SPEAKING_TEXT,
	sanitizePdfText,
} from "./placement-result-pdf-model";

const FONTS_DIR = path.resolve(import.meta.dirname, "../assets/fonts");

async function loadRealFontFromDisk(assetUrl: string): Promise<Uint8Array> {
	const cleanPath = assetUrl.split("?")[0] ?? assetUrl;
	const fileName = path.basename(cleanPath);
	const buf = await fs.readFile(path.join(FONTS_DIR, fileName));
	return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

async function extractPdfText(pdfBytes: Uint8Array): Promise<{
	numPages: number;
	fullText: string;
	pages: string[];
}> {
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const loadingTask = pdfjs.getDocument({
		data: new Uint8Array(pdfBytes),
		useWorkerFetch: false,
		disableFontFace: true,
	});
	const doc = await loadingTask.promise;
	const pages: string[] = [];
	try {
		for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
			const page = await doc.getPage(pageNum);
			const textContent = await page.getTextContent();
			const pageText = textContent.items
				.map((item) => ("str" in item ? item.str : ""))
				.join(" ");
			pages.push(pageText);
		}
	} finally {
		await loadingTask.destroy();
	}
	return {
		numPages: pages.length,
		fullText: pages.join("\n"),
		pages,
	};
}

function makeSnapshot(): PlacementSnapshot {
	return {
		version: 3,
		bands: [
			{
				min: 0,
				max: 49,
				cefr: "A2",
				course: "comm-1",
				courseLabel: "Giao tiếp nền tảng",
				displayCourse: "Giao tiếp nền tảng (A2)",
				advice:
					"Tập trung củng cố ngữ pháp nền tảng và phản xạ nghe nói cơ bản.",
			},
			{
				min: 50,
				max: 79,
				cefr: "B1+",
				course: "ielts-foundation",
				courseLabel: "IELTS Foundation",
				displayCourse: "IELTS Foundation 5.5+",
				advice:
					"Học viên đã có nền tảng vững; nên rèn thêm cấu trúc câu phức và từ vựng học thuật trong 12 tuần.",
			},
			{
				min: 80,
				max: 100,
				cefr: "B2+",
				course: "ielts-advanced",
				courseLabel: "IELTS Advanced",
				displayCourse: "IELTS Intensive 6.5+",
				advice: "Tập trung chiến thuật làm đề và nâng độ chính xác học thuật.",
			},
		],
		parts: [
			{ id: "listening", title: "Listening", clips: [] },
			{ id: "vocab-grammar", title: "Grammar & Vocabulary", questions: [] },
			{ id: "reading", title: "Reading", passages: [] },
			{
				id: "writing",
				title: "Writing",
				promptTitle: "Email to a friend",
				promptBody: "Write a short email.",
				minWords: 50,
				maxWords: 120,
			},
			{ id: "speaking", title: "Speaking", tasks: [] },
		],
	};
}

function makeIeltsSubmission(
	overrides: Partial<PlacementSubmissionDetail> = {},
): PlacementSubmissionDetail {
	const writingText =
		"Yesterday I go to school with my frend and we studied English together. It was very fun.";
	const speakingTranscript =
		"I usually wake up early and I very like reading books in the evening.";
	const writingErrors: PlacementError[] = [
		{
			id: "w-err-2",
			category: "spelling",
			quote: "frend",
			start: writingText.indexOf("frend"),
			end: writingText.indexOf("frend") + "frend".length,
			correction: "friend",
			explanation: "Thiếu chữ i trong từ friend.",
		},
		{
			id: "w-err-1",
			category: "grammar",
			quote: "go to school",
			start: writingText.indexOf("go to school"),
			end: writingText.indexOf("go to school") + "go to school".length,
			correction: "went to school",
			explanation: "Sai thì quá khứ đơn sau trạng từ Yesterday.",
		},
		{
			id: "w-err-unlocated",
			category: "coherence",
			quote: "Missing closing greeting",
			start: null,
			end: null,
			correction: "Best regards, Duong",
			explanation: "Nên thêm lời kết phù hợp cuối bài viết.",
		},
	];
	const speakingErrors: PlacementError[] = [
		{
			id: "s-err-1",
			category: "vocabulary",
			quote: "very like",
			start: speakingTranscript.indexOf("very like"),
			end: speakingTranscript.indexOf("very like") + "very like".length,
			correction: "really enjoy",
			explanation: "Không dùng 'very' trực tiếp trước động từ 'like'.",
		},
	];

	const snapshot = makeSnapshot();
	const provisionalBand = snapshot.bands[1];
	if (!provisionalBand) {
		throw new Error("Missing provisional band fixture");
	}
	return {
		id: "sub-001",
		leadId: "lead-001",
		studentId: null,
		studentName: "Nguyễn Thị Ánh Dương",
		studentPhone: "0987654321",
		testVersion: 3,
		status: "graded",
		submittedAt: "2026-11-18T03:30:00.000Z",
		snapshot,
		answers: {
			listening: { q1: "SECRET_LISTENING_KEY_XYZ" },
			vocabGrammar: { q2: 2 },
			reading: { q3: 1 },
		},
		objective: {
			listening: { correct: 8, total: 10, pct: 80 },
			vocabGrammar: { correct: 15, total: 20, pct: 75 },
			reading: { correct: 7, total: 10, pct: 70 },
			totalCorrect: 30,
			totalQuestions: 40,
			averagePct: 75,
			byLevel: [{ level: "B1", correct: 15, total: 20, pct: 75 }],
			items: [
				{
					id: "q1",
					section: "listening",
					type: "gap",
					level: "B1",
					prompt: "SECRET_PROMPT_SHOULD_NOT_APPEAR",
					expected: ["SECRET_LISTENING_KEY_XYZ"],
					studentAnswer: "SECRET_LISTENING_KEY_XYZ",
					correct: true,
				},
			],
			provisionalBand,
			provisionalSummary: "Tạm tính B1+",
		},
		writingText,
		writingWordCount: 17,
		speakingStatus: "uploaded",
		speakingMediaUrl: "/api/leads/lead-001/placement-submission/media",
		speakingMediaMime: "audio/webm",
		speakingMediaSize: 120_000,
		speakingDurationSec: 45,
		writingRubric: {
			task: 6.5,
			coherence: 6.0,
			lexical: 6.5,
			grammar: 6.5,
		},
		writingScore: 6.5,
		speakingRubric: {
			fluency: 6.0,
			lexical: 6.0,
			grammar: 5.5,
			pronunciation: 6.5,
		},
		speakingScore: 6.0,
		teacherFeedback:
			"Con viết mạch lạc, ý tưởng rõ ràng → cần chú ý chia động từ quá khứ! 🎓",
		finalBandLevel: "B1+",
		finalCourse: "ielts-foundation",
		finalDisplayCourse: "IELTS Foundation 5.5+",
		finalScorePct: 74.4,
		finalNote:
			"Phát âm ổn định, có thể bắt đầu ngay lớp tháng 12 để kịp mục tiêu.",
		gradedAt: "2026-11-20T05:15:00.000Z",
		zaloText: "SECRET_ZALO_TEXT_0987654321",
		aiStatus: "drafted",
		aiErrorCode: null,
		aiDraftedAt: "2026-11-18T03:32:00.000Z",
		aiWriting: {
			errors: [
				{
					id: "ai-draft-1",
					category: "grammar",
					quote: "AI_DRAFT_ONLY_QUOTE",
					start: null,
					end: null,
					correction: "AI_DRAFT_ONLY_FIX",
					explanation: "AI draft must never leak to PDF.",
				},
			],
		},
		aiSpeaking: null,
		speakingTranscript,
		writingErrors,
		speakingErrors,
		resultUrl: "https://profile.example.com/kiem-tra-dau-vao/ket-qua/?t=secret",
		resultEmailStatus: "sent",
		...overrides,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("buildPlacementPdfFilename", () => {
	it("normalizes Vietnamese diacritics and đ/Đ into a safe kebab-case slug", () => {
		expect(buildPlacementPdfFilename("Đỗ Thục Mỹ")).toBe(
			"phieu-ket-qua-do-thuc-my.pdf",
		);
		expect(buildPlacementPdfFilename("Nguyễn Thị Ánh Dương")).toBe(
			"phieu-ket-qua-nguyen-thi-anh-duong.pdf",
		);
		expect(buildPlacementPdfFilename("  Lê   Hoàng (B1+) 2026!!  ")).toBe(
			"phieu-ket-qua-le-hoang-b1-2026.pdf",
		);
	});

	it("falls back to default filename when student name has no ASCII letters or digits", () => {
		expect(buildPlacementPdfFilename("")).toBe(PDF_DEFAULT_FILENAME);
		expect(buildPlacementPdfFilename("   ")).toBe(PDF_DEFAULT_FILENAME);
		expect(buildPlacementPdfFilename("!!! — ***")).toBe(PDF_DEFAULT_FILENAME);
	});
});

describe("sanitizePdfText & formatPlacementPdfDate", () => {
	it("replaces unsupported symbols while preserving Vietnamese text and digits", () => {
		expect(
			sanitizePdfText(
				"Điểm B1+ • Cô Đỗ Thục Mỹ — sửa ① → ② ✓ ✗ 🎓 0929.060.994",
			),
		).toBe("Điểm B1+ • Cô Đỗ Thục Mỹ — sửa [1] -> [2] [OK] [X]  0929.060.994");
	});

	it("formats ISO dates in Vietnam timezone and falls back to em dash", () => {
		expect(formatPlacementPdfDate("2026-11-18T03:30:00.000Z")).toBe(
			"18/11/2026",
		);
		// 20:00 UTC on Nov 18 = 03:00 ICT on Nov 19
		expect(formatPlacementPdfDate("2026-11-18T20:00:00.000Z")).toBe(
			"19/11/2026",
		);
		expect(formatPlacementPdfDate(null)).toBe("—");
		expect(formatPlacementPdfDate("invalid-date")).toBe("—");
	});
});

describe("buildPlacementResultPdfModel", () => {
	it("builds full IELTS model with sorted numbered errors, bandAdvice, and no PII or answer keys", () => {
		const submission = makeIeltsSubmission();
		const model = buildPlacementResultPdfModel(submission);

		expect(model.filename).toBe("phieu-ket-qua-nguyen-thi-anh-duong.pdf");
		expect(model.studentName).toBe("Nguyễn Thị Ánh Dương");
		expect(model.submittedDate).toBe("18/11/2026");
		expect(model.gradedDate).toBe("20/11/2026");
		expect(model.overview).toEqual({
			cefr: "B1+",
			recommendedCourse: "IELTS Foundation 5.5+",
			overallScorePct: "74%",
		});
		expect(model.objectiveSkills).toEqual([
			{ key: "listening", label: "Listening", scoreText: "8/10 (80%)" },
			{
				key: "vocabGrammar",
				label: "Grammar & Vocabulary",
				scoreText: "15/20 (75%)",
			},
			{ key: "reading", label: "Reading", scoreText: "7/10 (70%)" },
		]);

		// Writing rubric & errors sorted by offset (go to school before frend; unlocated last)
		expect(model.writing.isIelts).toBe(true);
		expect(model.writing.totalText).toBe("Band 6.5/9");
		expect(model.writing.criteria).toHaveLength(4);
		expect(model.writing.criteria?.[0]?.label).toBe("Task Response");
		expect(model.writing.criteria?.[0]?.valueText).toBe("6.5/9");
		expect(
			model.writing.errors.map((e) => [e.number, e.quote, e.located]),
		).toEqual([
			[1, "go to school", true],
			[2, "frend", true],
			[3, "Missing closing greeting", false],
		]);
		expect(model.writing.segments.map((s) => s.text).join("")).toBe(
			submission.writingText,
		);

		// Speaking rubric & errors
		expect(model.speaking.hasContent).toBe(true);
		expect(model.speaking.skippedNotice).toBeNull();
		expect(model.speaking.isIelts).toBe(true);
		expect(model.speaking.totalText).toBe("Band 6.0/9");
		expect(model.speaking.criteria).toHaveLength(4);
		expect(model.speaking.errors).toHaveLength(1);
		expect(model.speaking.errors[0]?.quote).toBe("very like");

		// Feedback blocks include teacherFeedback (sanitized), resolved bandAdvice, finalNote
		expect(model.feedbackBlocks.map((b) => b.key)).toEqual([
			"teacherFeedback",
			"bandAdvice",
			"finalNote",
		]);
		expect(model.feedbackBlocks[0]?.body).toContain("->");
		expect(model.feedbackBlocks[0]?.body).not.toContain("→");
		expect(model.feedbackBlocks[1]?.body).toContain("12 tuần");

		// Never leaks phone, objective items/keys, AI drafts, or resultUrl
		const serialized = JSON.stringify(model);
		expect(serialized).not.toContain("0987654321");
		expect(serialized).not.toContain("SECRET_LISTENING_KEY_XYZ");
		expect(serialized).not.toContain("SECRET_PROMPT_SHOULD_NOT_APPEAR");
		expect(serialized).not.toContain("AI_DRAFT_ONLY_QUOTE");
		expect(serialized).not.toContain("resultUrl");
	});

	it("handles legacy Writing & Speaking rubrics (/15, /20) cleanly", () => {
		const submission = makeIeltsSubmission({
			writingRubric: { ct: 4, or: 4, lg: 4 },
			writingScore: 12,
			speakingStatus: "uploaded",
			speakingRubric: { gv: 4, dm: 4, pr: 3, ic: 5 },
			speakingScore: 16,
		});
		const model = buildPlacementResultPdfModel(submission);

		expect(model.writing.isIelts).toBe(false);
		expect(model.writing.totalText).toBe("12/15");
		expect(
			model.writing.criteria?.map((c) => `${c.label}:${c.valueText}`),
		).toEqual(["Content:4/5", "Organisation:4/5", "Language:4/5"]);

		expect(model.speaking.isIelts).toBe(false);
		expect(model.speaking.totalText).toBe("16/20");
		expect(
			model.speaking.criteria?.map((c) => `${c.label}:${c.valueText}`),
		).toEqual([
			"Grammar & Vocabulary:4/5",
			"Discourse Management:4/5",
			"Pronunciation:3/5",
			"Task Response:5/5",
		]);
	});

	it("handles empty writingText, skipped speaking, missing optional fields, and null errors", () => {
		const submission = makeIeltsSubmission({
			writingRubric: { ct: 4, or: 4, lg: 4 },
			writingScore: 12,
			writingText: "",
			writingWordCount: 0,
			writingErrors: null,
			speakingStatus: "skipped",
			speakingRubric: null,
			speakingScore: null,
			speakingTranscript: "",
			speakingErrors: [],
			teacherFeedback: "   ",
			finalBandLevel: "UNKNOWN_LEVEL",
			finalCourse: "comm-1",
			finalDisplayCourse: null,
			finalScorePct: null,
			finalNote: "",
			objective: {
				...makeIeltsSubmission().objective,
				listening: { correct: 0, total: 0, pct: null },
			},
		});

		const model = buildPlacementResultPdfModel(submission);

		expect(model.overview).toEqual({
			cefr: "UNKNOWN_LEVEL",
			recommendedCourse: "comm-1",
			overallScorePct: "—",
		});
		expect(model.objectiveSkills[0]?.scoreText).toBe("—");
		expect(model.writing.errors).toEqual([]);
		expect(model.speaking.hasContent).toBe(true);
		expect(model.speaking.skippedNotice).toBe(PDF_SKIPPED_SPEAKING_TEXT);
		expect(model.speaking.totalText).toBeNull();
		expect(model.feedbackBlocks).toEqual([]);

		const docDef = buildPlacementResultDocDefinition(model);
		const docJson = JSON.stringify(docDef);
		expect(docJson).toContain(PDF_EMPTY_WRITING_TEXT);
		expect(docJson).toContain(PDF_SKIPPED_SPEAKING_TEXT);
		expect(docJson).not.toContain("AI_DRAFT_ONLY_QUOTE");
	});

	it("preserves exact highlight offsets before sanitizing arrows and skips overlapping/out-of-bounds spans", () => {
		const text = "Plan A → Plan B: she go home early.";
		const goStart = text.indexOf("go home");
		const submission = makeIeltsSubmission({
			writingText: text,
			writingErrors: [
				{
					id: "e1",
					category: "grammar",
					quote: "go home",
					start: goStart,
					end: goStart + "go home".length,
					correction: "went home",
					explanation: "Quá khứ đơn.",
				},
				{
					id: "e2-overlap",
					category: "vocabulary",
					quote: "home early",
					start: goStart + 3,
					end: goStart + "go home early".length,
					correction: "",
					explanation: "Chồng lấn với lỗi trước.",
				},
				{
					id: "e3-oob",
					category: "spelling",
					quote: "out of bounds",
					start: 999,
					end: 1005,
					correction: "fixed",
					explanation: "Ngoài giới hạn chuỗi.",
				},
			],
		});

		const model = buildPlacementResultPdfModel(submission);
		const errorSegs = model.writing.segments.filter((s) => s.kind === "error");
		expect(errorSegs).toEqual([
			{ kind: "error", text: "go home", number: 1, category: "grammar" },
		]);
		expect(model.writing.segments.map((s) => s.text).join("")).toBe(
			"Plan A -> Plan B: she go home early.",
		);
		expect(
			model.writing.errors.map((e) => [e.id, e.number, e.located]),
		).toEqual([
			["e1", 1, true],
			["e2-overlap", 2, false],
			["e3-oob", 3, false],
		]);

		// Empty correction on e2-overlap should not emit a dangling arrow in card
		const docJson = JSON.stringify(buildPlacementResultDocDefinition(model));
		expect(docJson).toContain("home early");
	});

	it("omits Speaking section when speakingStatus is none and there is no score or transcript", () => {
		const submission = makeIeltsSubmission({
			speakingStatus: "none",
			speakingRubric: null,
			speakingScore: null,
			speakingTranscript: "",
			speakingErrors: [],
		});
		const model = buildPlacementResultPdfModel(submission);
		expect(model.speaking.hasContent).toBe(false);
		const docJson = JSON.stringify(buildPlacementResultDocDefinition(model));
		expect(docJson).not.toContain('"3. Speaking"');
		expect(docJson).toContain('"3. Nhận xét & Lộ trình"');
	});
});

describe("generatePlacementResultPdfBytes (real PDF binary + pdfjs-dist extraction)", () => {
	it("generates a valid vector PDF with Vietnamese diacritics, scores, error cards, and zero PII/key leaks", async () => {
		const submission = makeIeltsSubmission();
		const bytes = await generatePlacementResultPdfBytes(submission, {
			loadFont: loadRealFontFromDisk,
		});

		expect(bytes).toBeInstanceOf(Uint8Array);
		expect(bytes.byteLength).toBeGreaterThan(5_000);
		expect(new TextDecoder("ascii").decode(bytes.subarray(0, 5))).toBe("%PDF-");

		const extracted = await extractPdfText(bytes);
		expect(extracted.numPages).toBeGreaterThanOrEqual(1);

		const text = extracted.fullText;
		// Brand & title & student meta
		expect(text).toContain("CÔ ĐỖ THỤC MỸ");
		expect(text).toContain("THE ENGLISH CORNER");
		expect(text).toContain("PHIẾU KẾT QUẢ BÀI KIỂM TRA ĐẦU VÀO 5 KỸ NĂNG");
		expect(text).toContain("Nguyễn Thị Ánh Dương");
		expect(text).toContain("18/11/2026");
		expect(text).toContain("20/11/2026");

		// Overview & objective skills
		expect(text).toContain("B1+");
		expect(text).toContain("IELTS Foundation 5.5+");
		expect(text).toContain("74%");
		expect(text).toContain("8/10 (80%)");
		expect(text).toContain("15/20 (75%)");
		expect(text).toContain("7/10 (70%)");

		// Writing IELTS band, rubric, inline error markers, error cards (located & unlocated)
		expect(text).toContain("Band 6.5/9");
		expect(text).toContain("Task Response");
		expect(text).toContain("Coherence & Cohesion");
		expect(text).toContain("Lexical Resource");
		expect(text).toContain("Grammatical Range & Accuracy");
		expect(text).toContain("go to school");
		expect(text).toContain("went to school");
		expect(text).toContain("Sai thì quá khứ đơn");
		expect(text).toContain("[1]");
		expect(text).toContain("[3]");
		expect(text).toContain("Missing closing greeting");
		expect(text).toContain("Best regards, Duong");

		// Speaking IELTS band, rubric, transcript, error card
		expect(text).toContain("Band 6.0/9");
		expect(text).toContain("Fluency & Coherence");
		expect(text).toContain("very like");
		expect(text).toContain("really enjoy");

		// Feedback, band advice, note, footer
		expect(text).toContain("Con viết mạch lạc, ý tưởng rõ ràng ->");
		expect(text).toContain("nên rèn thêm cấu trúc câu phức");
		expect(text).toContain("bắt đầu ngay lớp tháng 12");
		expect(text).toContain("Hỗ trợ: Zalo 0929.060.994");
		expect(text).toContain(`Trang 1 / ${extracted.numPages}`);

		// Strict privacy & anti-leak assertions
		expect(text).not.toContain("0987654321");
		expect(text).not.toContain("SECRET_LISTENING_KEY_XYZ");
		expect(text).not.toContain("SECRET_PROMPT_SHOULD_NOT_APPEAR");
		expect(text).not.toContain("AI_DRAFT_ONLY_QUOTE");
		// No missing-glyph symbols emitted
		expect(text).not.toContain("→");
		expect(text).not.toContain("①");
	}, 15_000);

	it("renders legacy rubric, zero-error notice, and skipped Speaking cleanly into PDF", async () => {
		const submission = makeIeltsSubmission({
			studentName: "Trần Văn Minh",
			writingRubric: { ct: 5, or: 4, lg: 3 },
			writingScore: 12,
			writingText: "Hello teacher, I enjoy learning English every day.",
			writingWordCount: 8,
			writingErrors: [],
			speakingStatus: "skipped",
			speakingRubric: null,
			speakingScore: null,
			speakingTranscript: "",
			speakingErrors: [],
		});

		const bytes = await generatePlacementResultPdfBytes(submission, {
			loadFont: loadRealFontFromDisk,
		});
		expect(bytes.byteLength).toBeGreaterThan(5_000);
		expect(new TextDecoder("ascii").decode(bytes.subarray(0, 5))).toBe("%PDF-");

		const extracted = await extractPdfText(bytes);
		expect(extracted.fullText).toContain("Trần Văn Minh");
		expect(extracted.fullText).toContain("12/15");
		expect(extracted.fullText).toContain("Content");
		expect(extracted.fullText).toContain("5/5");
		expect(extracted.fullText).toContain(PDF_NO_ERRORS_TEXT);
		expect(extracted.fullText).toContain(PDF_SKIPPED_SPEAKING_TEXT);
	}, 15_000);

	it("paginates long essays and many error cards across multiple A4 pages with footer on every page", async () => {
		const longEssay = Array.from(
			{ length: 14 },
			(_, idx) =>
				`Paragraph ${idx + 1}: Learning English helps me communicate with international friends and explore new knowledge every day.`,
		).join("\n\n");
		const manyErrors: PlacementError[] = Array.from({ length: 8 }, (_, i) => ({
			id: `err-${i + 1}`,
			category: "grammar" as const,
			quote: `Sample phrase ${i + 1}`,
			start: null,
			end: null,
			correction: `Improved phrase ${i + 1}`,
			explanation: `Giải thích chi tiết cho lỗi số ${i + 1} để học viên nắm rõ cách sửa.`,
		}));

		const bytes = await generatePlacementResultPdfBytes(
			makeIeltsSubmission({
				writingText: longEssay,
				writingWordCount: 240,
				writingErrors: manyErrors,
			}),
			{ loadFont: loadRealFontFromDisk },
		);

		const extracted = await extractPdfText(bytes);
		expect(extracted.numPages).toBeGreaterThanOrEqual(2);
		extracted.pages.forEach((pageText, index) => {
			expect(pageText).toContain("Hỗ trợ: Zalo 0929.060.994");
			expect(pageText).toContain(`Trang ${index + 1} / ${extracted.numPages}`);
		});
	}, 15_000);

	it("surfaces font loading failures explicitly instead of failing silently", async () => {
		const submission = makeIeltsSubmission();
		await expect(
			generatePlacementResultPdfBytes(submission, {
				loadFont: async () => {
					throw new Error("Simulated font fetch failure");
				},
			}),
		).rejects.toThrow("Simulated font fetch failure");
	});

	it("triggers browser PDF download with sanitized filename, caches default font fetches, and recovers after fetch error", async () => {
		let shouldFailFirst = true;
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			if (shouldFailFirst) {
				return new Response(null, { status: 500 });
			}
			const url = typeof input === "string" ? input : String(input);
			const bytes = await loadRealFontFromDisk(url);
			const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
			copy.set(bytes);
			return new Response(copy, { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);

		const createdBlobs: Blob[] = [];
		const createObjectURLSpy = vi
			.spyOn(URL, "createObjectURL")
			.mockImplementation((obj) => {
				if (obj instanceof Blob) createdBlobs.push(obj);
				return "blob:placement-pdf-test";
			});
		const revokeObjectURLSpy = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation(() => {});

		const fakeAnchor = {
			href: "",
			download: "",
			rel: "",
			click: vi.fn(),
		};
		vi.stubGlobal("document", {
			createElement: vi.fn(() => fakeAnchor),
		});

		const submission = makeIeltsSubmission({ studentName: "Đỗ Thục Mỹ" });

		// First attempt fails -> error surfaces and cache must reset
		await expect(exportPlacementResultPdf(submission)).rejects.toThrow(
			/Không thể tải font PDF/,
		);
		expect(fakeAnchor.click).not.toHaveBeenCalled();

		// Second attempt succeeds -> fetches 4 font files and downloads PDF Blob
		shouldFailFirst = false;
		fetchMock.mockClear();
		await exportPlacementResultPdf(submission);

		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
		expect(createdBlobs[0]?.type).toBe("application/pdf");
		expect(createdBlobs[0]?.size).toBeGreaterThan(5_000);
		expect(fakeAnchor.href).toBe("blob:placement-pdf-test");
		expect(fakeAnchor.download).toBe("phieu-ket-qua-do-thuc-my.pdf");
		expect(fakeAnchor.click).toHaveBeenCalledTimes(1);

		// Wait for deferred revokeObjectURL
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:placement-pdf-test");

		// Third export reuses cached font VFS (0 additional fetches!)
		await exportPlacementResultPdf(submission);
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(fakeAnchor.click).toHaveBeenCalledTimes(2);
	}, 15_000);
});
