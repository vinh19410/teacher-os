import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { LEAD_COURSE_LABELS } from "./lead-contracts";
import {
	buildPlacementSnapshot,
	buildPlacementZaloText,
	computePlacementFinal,
	countPlacementWords,
	detectSpeakingAudioMimeFromBytes,
	extractReferencedAudioIds,
	gradePlacementObjective,
	hasPlacementSpeakingTasks,
	isIeltsSpeakingRubric,
	isIeltsWritingRubric,
	isLikelyInAppBrowser,
	matchPlacementBand,
	normalizePlacementGapAnswer,
	normalizePublishedPlacementSnapshot,
	PLACEMENT_ID_REGEX,
	PLACEMENT_LEGACY_SPEAKING_RUBRIC,
	PLACEMENT_LEGACY_WRITING_RUBRIC,
	PLACEMENT_MAX_QUESTIONS,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
	type PlacementContent,
	parseStoredSpeakingRubric,
	parseStoredWritingRubric,
	placementContentSchema,
	placementPublicSubmitSchema,
	resolvePlacementSpeakingUploadMeta,
	studentPlacementSubmitSchema,
	upgradeLegacyPlacementContent,
	validatePlacementForPublish,
} from "./placement-test-contracts";
import {
	allocateUniquePlacementId,
	createDefaultPlacementReadingPart,
	createDefaultPlacementSpeakingPart,
	createDefaultPlacementWritingPart,
} from "./placement-test-defaults";

const SAMPLE_AUDIO_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_AUDIO_ID_2 = "22222222-2222-4222-8222-222222222222";

function makeValidContent(): PlacementContent {
	return {
		bands: [
			{
				min: 0,
				max: 29,
				cefr: "Pre-A1",
				course: "foundation-core",
				displayCourse: "Chưa đủ nền cho Level 1",
				advice: "Học lớp nền tảng.",
			},
			{
				min: 30,
				max: 54,
				cefr: "A1",
				course: "comm-1",
				displayCourse: "Communication English Level 1",
				advice: "Học từ Lesson 1.",
			},
			{
				min: 55,
				max: 67,
				cefr: "A2",
				course: "comm-1",
				displayCourse: "Communication English Level 1",
				advice: "Chắc nền A2 rồi lên Level 2.",
			},
			{
				min: 68,
				max: 84,
				cefr: "A2+ / B1 thấp",
				course: "comm-2",
				displayCourse: "Communication English Level 2",
				advice: "Học trọn khoá Level 2.",
			},
			{
				min: 85,
				max: 100,
				cefr: "B1 trở lên",
				course: "comm-3",
				displayCourse: "Vượt Level 2",
				advice: "Vào lớp B1+.",
			},
		],
		parts: [
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-la",
						partLabel: "Part 1",
						instruction: "Listen and choose.",
						title: "Clip A",
						notesTitle: "",
						transcript: "Female: Secret teacher transcript",
						audioId: SAMPLE_AUDIO_ID,
						maxPlays: 2,
						level: "A1",
						questions: [
							{
								id: "l-a1",
								type: "mcq",
								level: "A1",
								prompt: "What time?",
								options: ["7:00", "7:15", "7:45"],
								answer: 1,
							},
							{
								id: "l-e1",
								type: "gap",
								level: "A2",
								prompt: "Price: $ ____",
								accept: ["240", "twohundredforty"],
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
						id: "gv-01",
						kind: "grammar",
						level: "A1",
						prompt: "She ___ a doctor.",
						options: ["am", "is", "are"],
						answer: 1,
					},
				],
			},
			{
				id: "reading",
				title: "Reading",
				passages: [
					{
						id: "ra",
						partLabel: "Part 1",
						kind: "sign",
						instruction: "Choose.",
						title: "POOL",
						body: "POOL CLOSED MONDAY",
						questions: [
							{
								id: "r-a1",
								level: "A1",
								prompt: "",
								options: ["Open daily", "Closed Monday", "Free entry"],
								answer: 1,
							},
						],
					},
				],
			},
			{
				id: "writing",
				title: "Writing",
				promptTitle: "Email",
				promptBody: "Write an email to a friend.",
				minWords: 50,
				maxWords: 80,
			},
			{
				id: "speaking",
				title: "Speaking",
				tasks: [
					{
						id: "s-01",
						partLabel: "Part 1",
						level: "A1",
						prompt: "What is your name?",
						prepSeconds: 5,
						answerSeconds: 20,
					},
				],
			},
		],
	};
}

describe("placement-test-contracts v2", () => {
	it("cho phép lưu nháp dở (answer: null, audioId: null, prompt rỗng)", () => {
		const draft = makeValidContent();
		const q0 = draft.parts[1].questions[0]!;
		q0.answer = null;
		q0.prompt = "";
		draft.parts[0].clips[0]!.audioId = null;

		const parsed = placementContentSchema.safeParse(draft);
		expect(parsed.success).toBe(true);
	});

	it("hỗ trợ cả 3 và 4 phương án trắc nghiệm và từ chối tổng câu > 100", () => {
		const content = makeValidContent();
		content.parts[1].questions[0]!.options = ["am", "is", "are", "be"];
		expect(placementContentSchema.safeParse(content).success).toBe(true);

		const tooMany = makeValidContent();
		tooMany.parts[1].questions = Array.from({ length: 99 }, (_, idx) => ({
			id: `gv-${idx + 1}`,
			kind: "grammar" as const,
			level: "A1",
			prompt: `Q ${idx}`,
			options: ["a", "b", "c"],
			answer: 0,
		}));
		expect(placementContentSchema.safeParse(tooMany).success).toBe(false);
	});

	it("validatePlacementForPublish chấp nhận đề 5 kỹ năng hợp lệ", () => {
		expect(validatePlacementForPublish(makeValidContent())).toEqual([]);
	});

	it("validatePlacementForPublish bắt ngưỡng % hở, chồng, không kết thúc ở 100%, thiếu đề Writing/Speaking", () => {
		const bad = makeValidContent();
		bad.bands = [
			{
				min: 0,
				max: 40,
				cefr: "A1",
				course: "comm-1",
				displayCourse: "Level 1",
				advice: "",
			},
			{
				min: 45,
				max: 90,
				cefr: "B1",
				course: "comm-2",
				displayCourse: "Level 2",
				advice: "",
			},
		];
		bad.parts[3].promptBody = "";
		bad.parts[4].tasks = [];

		const paths = validatePlacementForPublish(bad).map((i) => i.path);
		expect(paths).toContain("bands.1.min");
		expect(paths).toContain("bands.1.max");
		expect(paths).toContain("parts.3.promptBody");
		expect(paths).toContain("parts.4.tasks");
	});

	it("buildPlacementSnapshot bỏ audioId & transcript, chuẩn hóa gap accept và gắn courseLabel", () => {
		const content = makeValidContent();
		const snapshot = buildPlacementSnapshot(content, 4);
		expect(snapshot.version).toBe(4);
		expect(snapshot.bands[3]?.courseLabel).toBe(LEAD_COURSE_LABELS["comm-2"]);
		expect(snapshot.parts[0].clips[0]?.src).toBe(
			`/public/placement-test/audio/${SAMPLE_AUDIO_ID}`,
		);
		expect(JSON.stringify(snapshot)).not.toContain("audioId");
		expect(JSON.stringify(snapshot)).not.toContain("Secret teacher transcript");
	});

	it("upgradeLegacyPlacementContent nâng cấp an toàn draft v1 2 phần sang v2 5 phần", () => {
		const v1Draft = {
			bands: [
				{ min: 0, max: 1, cefr: "A1", course: "comm-1" },
				{ min: 2, max: 2, cefr: "A2", course: "comm-1" },
			],
			parts: [
				{
					id: "vocab-grammar",
					title: "Vocab + Grammar",
					questions: [
						{
							id: "vg-01",
							kind: "grammar",
							level: "A1",
							prompt: "Old VG",
							options: ["a", "b", "c", "d"],
							answer: 0,
						},
					],
				},
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "clip-1",
							audioId: SAMPLE_AUDIO_ID,
							maxPlays: 2,
							level: "A2",
							title: "Old Clip",
							questions: [
								{
									id: "l-01",
									level: "A2",
									prompt: "Old L",
									options: ["1", "2", "3", "4"],
									answer: 1,
								},
							],
						},
					],
				},
			],
		};

		const upgraded = upgradeLegacyPlacementContent(v1Draft);
		expect(upgraded).not.toBeNull();
		expect(upgraded?.parts.map((p) => p.id)).toEqual([
			"listening",
			"vocab-grammar",
			"reading",
			"writing",
			"speaking",
		]);
		expect(placementContentSchema.safeParse(upgraded).success).toBe(true);
		const readingPart = upgraded?.parts[2];
		const writingPart = upgraded?.parts[3];
		const speakingPart = upgraded?.parts[4];
		expect(readingPart?.id).toBe("reading");
		if (readingPart?.id === "reading") {
			expect(readingPart.passages).toHaveLength(6);
			const totalReadingQs = readingPart.passages.reduce(
				(sum, p) => sum + p.questions.length,
				0,
			);
			expect(totalReadingQs).toBe(15);
		}
		if (writingPart?.id === "writing") {
			expect(writingPart.promptTitle).toBe("Email to a friend");
			expect(writingPart.promptBody.length).toBeGreaterThan(0);
			expect(writingPart.minWords).toBe(50);
			expect(writingPart.maxWords).toBe(80);
		}
		if (speakingPart?.id === "speaking") {
			expect(speakingPart.tasks).toHaveLength(8);
		}
		expect(validatePlacementForPublish(upgraded!)).toEqual([]);
		expect(upgraded?.bands[0]?.min).toBe(0);
		expect(upgraded?.bands[upgraded.bands.length - 1]?.max).toBe(100);
	});

	it("chấm objective (MCQ + gap chuẩn hóa) và quy tắc hạ 1 bậc Speaking khi lệch >= 2 bậc", () => {
		const snapshot = buildPlacementSnapshot(makeValidContent(), 1);
		expect(normalizePlacementGapAnswer("  $240 ")).toBe("240");
		expect(normalizePlacementGapAnswer("8 p.m.")).toBe("8");
		expect(countPlacementWords("Hello friend,\nI moved here yesterday.")).toBe(
			6,
		);

		const obj = gradePlacementObjective(snapshot, {
			listening: { "l-a1": 1, "l-e1": "$240" },
			vocabGrammar: { "gv-01": 1 },
			reading: { "r-a1": 1 },
		});
		expect(obj.listening.correct).toBe(2);
		expect(obj.vocabGrammar.correct).toBe(1);
		expect(obj.reading.correct).toBe(1);
		expect(obj.averagePct).toBe(100);
		expect(obj.provisionalBand.cefr).toBe("B1 trở lên");

		// Speaking = Band 1.0/9 (11.1% -> Pre-A1, index 0), tổng thể ~80% (A2+/B1 thấp, index 3) => hạ 1 bậc xuống A2 (index 2)!
		const downgraded = computePlacementFinal({
			objective: obj,
			bands: snapshot.bands,
			writingScore: 9,
			speakingScore: 1,
		});
		expect(downgraded.band.cefr).toBe("A2");
		expect(downgraded.note).toContain("hạ 1 bậc");

		// Speaking rất cao vs điểm khác thấp
		const weakObj = gradePlacementObjective(snapshot, {
			listening: { "l-a1": 0, "l-e1": "wrong" },
			vocabGrammar: { "gv-01": 0 },
			reading: { "r-a1": 0 },
		});
		const boosted = computePlacementFinal({
			objective: weakObj,
			bands: snapshot.bands,
			writingScore: 1.5,
			speakingScore: 9,
		});
		expect(boosted.note).toContain("cân nhắc lớp cao hơn");

		const zalo = buildPlacementZaloText({
			studentName: "Nguyen An",
			phone: "0901234567",
			objective: obj,
			writingScore: 6.5,
			speakingScore: 7,
			speakingStatus: "uploaded",
			band: downgraded.band,
			averagePct: downgraded.averagePct,
			note: downgraded.note,
			teacherFeedback: "Cần luyện phát âm âm cuối.",
		});
		expect(zalo).toContain("Nguyen An (0901234567)");
		expect(zalo).toContain("Writing: Band 6.5/9 (72%)");
		expect(zalo).toContain("Speaking: Band 7.0/9 (78%)");
		expect(zalo).toContain("Nhan xet cua Co My: Cần luyện phát âm âm cuối.");
	});

	it("extractReferencedAudioIds đọc được cả audioId trong draft và src trong published snapshot", () => {
		const draft = makeValidContent();
		const published = buildPlacementSnapshot(draft, 1);
		draft.parts[0].clips[0]!.audioId = SAMPLE_AUDIO_ID_2;

		const ids = extractReferencedAudioIds(
			JSON.stringify(draft),
			JSON.stringify(published),
		);
		expect([...ids].sort()).toEqual(
			[SAMPLE_AUDIO_ID, SAMPLE_AUDIO_ID_2].sort(),
		);
	});

	it("normalizePublishedPlacementSnapshot nâng cấp snapshot published v1 (2 phần, ngưỡng theo số câu) và chấm được objective", () => {
		const v1Published = {
			version: 3,
			bands: [
				{
					min: 0,
					max: 1,
					cefr: "A1",
					course: "comm-1",
					courseLabel: "Giao tiếp 1",
				},
				{
					min: 2,
					max: 2,
					cefr: "B1",
					course: "comm-3",
					courseLabel: "Giao tiếp 3",
				},
			],
			parts: [
				{
					id: "vocab-grammar",
					title: "Vocab + Grammar",
					questions: [
						{
							id: "vg-1",
							kind: "grammar",
							level: "A1",
							prompt: "She ____ to school every day.",
							options: ["go", "goes", "going", "gone"],
							answer: 1,
						},
					],
				},
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "clip-1",
							src: `/public/placement-test/audio/${SAMPLE_AUDIO_ID}`,
							maxPlays: 2,
							level: "A1",
							title: "Clip 1",
							questions: [
								{
									id: "l-1",
									level: "A1",
									prompt: "What is her job?",
									options: ["Doctor", "Teacher", "Nurse", "Driver"],
									answer: 1,
								},
							],
						},
					],
				},
			],
		};

		const normalized = normalizePublishedPlacementSnapshot(v1Published);
		expect(normalized).not.toBeNull();
		expect(normalized?.version).toBe(3);
		expect(normalized?.parts.map((p) => p.id)).toEqual([
			"listening",
			"vocab-grammar",
			"reading",
			"writing",
			"speaking",
		]);
		expect(normalized?.parts[0].clips[0]?.src).toBe(
			`/public/placement-test/audio/${SAMPLE_AUDIO_ID}`,
		);
		expect(normalized?.parts[2].passages).toHaveLength(6);
		const readingQs =
			normalized?.parts[2].passages.flatMap((p) => p.questions) ?? [];
		expect(readingQs).toHaveLength(15);
		expect(normalized?.parts[3].promptTitle).toBe("Email to a friend");
		expect(normalized?.parts[3].promptBody.length).toBeGreaterThan(0);
		expect(normalized?.parts[4].tasks).toHaveLength(8);
		expect(normalized?.bands[0]?.min).toBe(0);
		expect(normalized?.bands[normalized.bands.length - 1]?.max).toBe(100);

		const objectiveEmptyReading = gradePlacementObjective(normalized!, {
			listening: { "l-1": 1 },
			vocabGrammar: { "vg-1": 1 },
			reading: {},
		});
		expect(objectiveEmptyReading.listening).toMatchObject({
			correct: 1,
			total: 1,
		});
		expect(objectiveEmptyReading.vocabGrammar).toMatchObject({
			correct: 1,
			total: 1,
		});
		expect(objectiveEmptyReading.reading).toMatchObject({
			correct: 0,
			total: 15,
			pct: 0,
		});
		expect(objectiveEmptyReading.averagePct).toBe(67);

		const readingAnswers = Object.fromEntries(
			readingQs.map((q) => [q.id, q.answer]),
		);
		const objectiveAllCorrect = gradePlacementObjective(normalized!, {
			listening: { "l-1": 1 },
			vocabGrammar: { "vg-1": 1 },
			reading: readingAnswers,
		});
		expect(objectiveAllCorrect.reading).toMatchObject({
			correct: 15,
			total: 15,
			pct: 100,
		});
		expect(objectiveAllCorrect.averagePct).toBe(100);
		expect(objectiveAllCorrect.provisionalBand.cefr).toBe("B1");

		expect(normalizePublishedPlacementSnapshot({ invalid: true })).toBeNull();
	});

	it("dữ liệu mặc định 3 kỹ năng khớp tuyệt đối với questions.json và deep-clone an toàn", () => {
		const seedPath = fileURLToPath(
			new URL(
				"../../../apps/web/public/placement-seed/questions.json",
				import.meta.url,
			).href,
		);
		const seed = JSON.parse(readFileSync(seedPath, "utf8")) as {
			parts: unknown[];
		};
		const reading1 = createDefaultPlacementReadingPart();
		const writing1 = createDefaultPlacementWritingPart();
		const speaking1 = createDefaultPlacementSpeakingPart();

		expect(reading1).toEqual(seed.parts[2]);
		expect(writing1).toEqual(seed.parts[3]);
		expect(speaking1).toEqual(seed.parts[4]);

		reading1.passages[0]?.questions[0]?.options.push("MUTATED");
		writing1.promptTitle = "MUTATED";
		if (speaking1.tasks[0]) {
			speaking1.tasks[0].prompt = "MUTATED";
		}

		const reading2 = createDefaultPlacementReadingPart();
		const writing2 = createDefaultPlacementWritingPart();
		const speaking2 = createDefaultPlacementSpeakingPart();
		expect(reading2.passages[0]?.questions[0]?.options).not.toContain(
			"MUTATED",
		);
		expect(writing2.promptTitle).toBe("Email to a friend");
		expect(speaking2.tasks[0]?.prompt).not.toBe("MUTATED");
	});

	it("chuẩn hóa legacy bands có course lạ và tránh chồng lấn biên 100 khi >= 3 bands", () => {
		const v1Draft = {
			bands: [
				{ min: 0, max: 29, cefr: "Pre-A1", course: "unknown-legacy-course" },
				{ min: 30, max: 30, cefr: "A1", course: "comm-1" },
				{ min: 30, max: 30, cefr: "A2", course: "comm-2" },
				{ min: 30, max: 30, cefr: "B1", course: "comm-3" },
			],
			parts: [
				{
					id: "vocab-grammar",
					title: "Vocab + Grammar",
					questions: [
						{
							id: "vg-01",
							kind: "grammar",
							level: "A1",
							prompt: "Old VG",
							options: ["a", "b", "c", "d"],
							answer: 0,
						},
					],
				},
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "clip-1",
							audioId: SAMPLE_AUDIO_ID,
							maxPlays: 2,
							level: "A2",
							title: "Old Clip",
							questions: [
								{
									id: "l-01",
									level: "A2",
									prompt: "Old L",
									options: ["1", "2", "3", "4"],
									answer: 1,
								},
							],
						},
					],
				},
			],
		};

		const upgraded = upgradeLegacyPlacementContent(v1Draft);
		expect(upgraded).not.toBeNull();
		expect(upgraded?.bands[0]?.course).toBe("comm-1");
		expect(upgraded?.bands[0]?.displayCourse).toBe(
			LEAD_COURSE_LABELS["comm-1"],
		);
		expect(upgraded?.bands[3]?.max).toBe(100);
		for (let i = 1; i < (upgraded?.bands.length ?? 0); i += 1) {
			const prev = upgraded!.bands[i - 1]!;
			const curr = upgraded!.bands[i]!;
			expect(curr.min).toBe(prev.max + 1);
			expect(curr.min).toBeLessThanOrEqual(curr.max);
		}
		expect(validatePlacementForPublish(upgraded!)).toEqual([]);
	});

	it("chống trùng ID <= 64 ký tự khi backfill đè trùng r-a1 / r-a1-d1", () => {
		const used = new Set(["r-a1", "r-a1-d1"]);
		expect(allocateUniquePlacementId("r-a1", used)).toBe("r-a1-d2");
		const longId = "a".repeat(64);
		const longSet = new Set([longId]);
		const dedupedLong = allocateUniquePlacementId(longId, longSet);
		expect(dedupedLong).not.toBe(longId);
		expect(dedupedLong.length).toBeLessThanOrEqual(64);
		expect(PLACEMENT_ID_REGEX.test(dedupedLong)).toBe(true);

		const collidingV1Draft = {
			bands: [
				{ min: 0, max: 1, cefr: "A1", course: "comm-1" },
				{ min: 2, max: 2, cefr: "B1", course: "comm-3" },
			],
			parts: [
				{
					id: "vocab-grammar",
					title: "VG",
					questions: [
						{
							id: "r-a1",
							kind: "grammar",
							level: "A1",
							prompt: "Q1",
							options: ["a", "b", "c", "d"],
							answer: 0,
						},
						{
							id: "r-a1-d1",
							kind: "vocab",
							level: "A1",
							prompt: "Q2",
							options: ["a", "b", "c", "d"],
							answer: 1,
						},
					],
				},
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "clip-1",
							audioId: SAMPLE_AUDIO_ID,
							maxPlays: 2,
							level: "A1",
							title: "Clip 1",
							questions: [
								{
									id: "l-01",
									level: "A1",
									prompt: "LQ",
									options: ["1", "2", "3", "4"],
									answer: 0,
								},
							],
						},
					],
				},
			],
		};

		const upgraded = upgradeLegacyPlacementContent(collidingV1Draft);
		expect(upgraded).not.toBeNull();
		const readingQs = upgraded!.parts[2].passages.flatMap((p) => p.questions);
		expect(readingQs[0]?.id).toBe("r-a1-d2");
		expect(validatePlacementForPublish(upgraded!)).toEqual([]);
	});

	it("tôn trọng trần 100 câu đối xứng giữa draft v1, snapshot v1 và snapshot v2", () => {
		const makeVg = (count: number) =>
			Array.from({ length: count }, (_, idx) => ({
				id: `vg-${idx + 1}`,
				kind: "grammar" as const,
				level: "A1",
				prompt: `VG ${idx + 1}`,
				options: ["a", "b", "c", "d"],
				answer: 0,
			}));
		const makeListeningQs = (offset: number, count: number) =>
			Array.from({ length: count }, (_, idx) => ({
				id: `l-${offset + idx + 1}`,
				level: "A1",
				prompt: `L ${offset + idx + 1}`,
				options: ["1", "2", "3", "4"],
				answer: 1,
			}));

		const v1NearCapDraft = {
			bands: [{ min: 0, max: 95, cefr: "B1", course: "comm-3" }],
			parts: [
				{
					id: "vocab-grammar",
					title: "VG",
					questions: makeVg(55),
				},
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "c1",
							audioId: SAMPLE_AUDIO_ID,
							maxPlays: 2,
							level: "A1",
							title: "C1",
							questions: makeListeningQs(0, 20),
						},
						{
							id: "c2",
							audioId: SAMPLE_AUDIO_ID_2,
							maxPlays: 2,
							level: "A2",
							title: "C2",
							questions: makeListeningQs(20, 20),
						},
					],
				},
			],
		};

		const upgradedDraft = upgradeLegacyPlacementContent(v1NearCapDraft);
		expect(upgradedDraft).not.toBeNull();
		expect(placementContentSchema.safeParse(upgradedDraft).success).toBe(true);
		const draftReadingQs = upgradedDraft!.parts[2].passages.flatMap(
			(p) => p.questions,
		);
		expect(draftReadingQs).toHaveLength(PLACEMENT_MAX_QUESTIONS - 95);
		expect(
			upgradedDraft!.parts[2].passages.every((p) => p.questions.length > 0),
		).toBe(true);

		const snapNearCap = normalizePublishedPlacementSnapshot({
			...v1NearCapDraft,
			version: 2,
		});
		expect(snapNearCap).not.toBeNull();
		expect(
			snapNearCap!.parts[2].passages.flatMap((p) => p.questions),
		).toHaveLength(PLACEMENT_MAX_QUESTIONS - 95);

		const v2SnapNearCap = normalizePublishedPlacementSnapshot({
			...snapNearCap!,
			parts: [
				snapNearCap!.parts[0],
				snapNearCap!.parts[1],
				{ id: "reading", title: "Reading", passages: [] },
				snapNearCap!.parts[3],
				snapNearCap!.parts[4],
			],
		});
		expect(
			v2SnapNearCap!.parts[2].passages.flatMap((p) => p.questions),
		).toHaveLength(PLACEMENT_MAX_QUESTIONS - 95);

		const v1AtCapDraft = {
			...v1NearCapDraft,
			parts: [
				{ id: "vocab-grammar", title: "VG", questions: makeVg(60) },
				v1NearCapDraft.parts[1],
			],
		};
		const atCap = upgradeLegacyPlacementContent(v1AtCapDraft);
		expect(atCap?.parts[2].passages).toEqual([]);
	});

	it("giữ nguyên draft v2 đang chỉnh sửa nhưng backfill phòng thủ cho published snapshot v2 thiếu nội dung", () => {
		const validContent = makeValidContent();
		const v2DraftWithEmptyReading: PlacementContent = {
			...validContent,
			parts: [
				validContent.parts[0],
				validContent.parts[1],
				{ id: "reading", title: "Reading", passages: [] },
				{
					id: "writing",
					title: "Writing",
					promptTitle: "",
					promptBody: "",
					minWords: 50,
					maxWords: 80,
				},
				{ id: "speaking", title: "Speaking", tasks: [] },
			],
		};

		const untouchedDraft = upgradeLegacyPlacementContent(
			v2DraftWithEmptyReading,
		);
		expect(untouchedDraft?.parts[2].passages).toEqual([]);
		expect(untouchedDraft?.parts[3].promptBody).toBe("");
		expect(untouchedDraft?.parts[4].tasks).toEqual([]);

		const v2SnapEmpty = {
			...buildPlacementSnapshot(v2DraftWithEmptyReading, 4),
			parts: [
				...buildPlacementSnapshot(v2DraftWithEmptyReading, 4).parts.slice(0, 3),
				{
					id: "writing",
					title: "Writing",
					promptTitle: "Custom Stale Title",
					promptBody: "   ",
					minWords: 120,
					maxWords: 60,
				},
				{ id: "speaking", title: "Speaking", tasks: [] },
			],
		};

		const recovered = normalizePublishedPlacementSnapshot(v2SnapEmpty);
		expect(recovered?.parts[2].passages).toHaveLength(6);
		expect(recovered?.parts[3].promptTitle).toBe("Email to a friend");
		expect(recovered?.parts[3].promptBody.length).toBeGreaterThan(0);
		expect(recovered?.parts[3].minWords).toBe(120);
		expect(recovered?.parts[3].maxWords).toBe(120);
		expect(recovered?.parts[4].tasks).toHaveLength(8);

		const v2SnapTitleMissingOnly = {
			...buildPlacementSnapshot(v2DraftWithEmptyReading, 4),
			parts: [
				...buildPlacementSnapshot(v2DraftWithEmptyReading, 4).parts.slice(0, 3),
				{
					id: "writing",
					title: "Writing",
					promptTitle: "  ",
					promptBody: "Write about your hometown.",
					minWords: 40,
					maxWords: 90,
				},
				{ id: "speaking", title: "Speaking", tasks: [] },
			],
		};
		const titleRecovered = normalizePublishedPlacementSnapshot(
			v2SnapTitleMissingOnly,
		);
		expect(titleRecovered?.parts[3].promptTitle).toBe("Bài viết ngắn");
		expect(titleRecovered?.parts[3].promptBody).toBe(
			"Write about your hometown.",
		);
	});

	it("buildPlacementZaloText hiển thị đúng nhãn khi speakingStatus === 'none'", () => {
		const snapshot = buildPlacementSnapshot(makeValidContent(), 1);
		const objective = gradePlacementObjective(snapshot, {
			listening: {},
			vocabGrammar: {},
			reading: {},
		});
		const text = buildPlacementZaloText({
			studentName: "Nguyen An",
			phone: "0901234567",
			objective,
			writingScore: null,
			speakingScore: null,
			speakingStatus: "none",
			band: snapshot.bands[0]!,
			averagePct: 0,
			note: "",
			teacherFeedback: "",
		});
		expect(text).toContain("Speaking: không có bài nói");
	});

	it("[I1] giới hạn tối đa 8 band và chuẩn hoá cefr rỗng/quá dài khi nâng cấp legacy v1", () => {
		const nineBands = Array.from({ length: 9 }, (_, i) => ({
			min: i * 2,
			max: i * 2 + 1,
			cefr: i === 0 ? "   " : i === 1 ? ` ${"B".repeat(50)} ` : `A${i}`,
			course: "comm-1",
		}));
		const legacyNineBands = {
			bands: nineBands,
			parts: [
				{
					id: "vocab-grammar",
					title: "   ",
					questions: Array.from({ length: 2 }, (_, idx) => ({
						id: `vg-b-${idx}`,
						level: "A1",
						prompt: `VG ${idx}?`,
						options: ["A", "B", "C", "D"],
						answer: 0,
					})),
				},
				{
					id: "listening",
					title: "  ",
					clips: [
						{
							id: "c-b1",
							audioId: SAMPLE_AUDIO_ID,
							maxPlays: 2,
							level: "A1",
							title: "C1",
							questions: [
								{
									id: "l-b1",
									level: "A1",
									prompt: "Listen 1",
									options: ["A", "B", "C", "D"],
									answer: 1,
								},
							],
						},
					],
				},
			],
		};

		const upgraded = upgradeLegacyPlacementContent(legacyNineBands);
		expect(upgraded).not.toBeNull();
		expect(placementContentSchema.safeParse(upgraded).success).toBe(true);
		expect(upgraded!.bands).toHaveLength(8);
		expect(upgraded!.bands[0]!.cefr).toBe("Level 1");
		expect(upgraded!.bands[1]!.cefr).toBe("B".repeat(40));
		expect(upgraded!.parts[0].title).toBe("Listening");
		expect(upgraded!.parts[1].title).toBe("Grammar & Vocabulary");

		const snap = normalizePublishedPlacementSnapshot({
			...legacyNineBands,
			version: 5,
		});
		expect(snap).not.toBeNull();
		expect(snap!.bands).toHaveLength(8);
		expect(snap!.parts[0].title).toBe("Listening");
		expect(snap!.parts[1].title).toBe("Grammar & Vocabulary");
	});

	it("[M1] bỏ qua bài cloze nếu ngân sách câu hỏi còn lại không đủ chứa trọn bài", () => {
		const makeVgList = (count: number) =>
			Array.from({ length: count }, (_, idx) => ({
				id: `vg-m1-${idx + 1}`,
				level: "A2",
				prompt: `VG ${idx + 1}?`,
				options: ["A", "B", "C", "D"],
				answer: 0,
			}));
		const makeListeningList = (count: number) =>
			Array.from({ length: count }, (_, idx) => ({
				id: `l-m1-${idx + 1}`,
				level: "A2",
				prompt: `L ${idx + 1}?`,
				options: ["A", "B", "C", "D"],
				answer: 1,
			}));

		const draftWith88Existing = {
			bands: [{ min: 0, max: 88, cefr: "B1", course: "comm-2" }],
			parts: [
				{ id: "vocab-grammar", title: "VG", questions: makeVgList(68) },
				{
					id: "listening",
					title: "Listening",
					clips: [
						{
							id: "c-m1",
							audioId: SAMPLE_AUDIO_ID,
							maxPlays: 2,
							level: "A2",
							title: "Clip 1",
							questions: makeListeningList(20),
						},
					],
				},
			],
		};

		const upgraded = upgradeLegacyPlacementContent(draftWith88Existing);
		expect(upgraded).not.toBeNull();
		const passages = upgraded!.parts[2].passages;
		expect(passages.some((p) => p.kind === "cloze")).toBe(false);
		expect(passages.flatMap((p) => p.questions)).toHaveLength(9);
	});

	it("[M3] khôi phục an toàn snapshot v2 có minWords/maxWords < 10 và tiêu đề toàn khoảng trắng", () => {
		const baseSnap = buildPlacementSnapshot(makeValidContent(), 7);
		const corruptedSnap = {
			...baseSnap,
			parts: [
				{ ...baseSnap.parts[0], title: "   " },
				{ ...baseSnap.parts[1], title: "\t\n" },
				{ ...baseSnap.parts[2], title: "  ", passages: [] },
				{
					...baseSnap.parts[3],
					title: "   ",
					promptTitle: "   ",
					promptBody: "   ",
					minWords: 0,
					maxWords: 0,
				},
				{ ...baseSnap.parts[4], title: "  ", tasks: [] },
			],
		};

		const normalized = normalizePublishedPlacementSnapshot(corruptedSnap);
		expect(normalized).not.toBeNull();
		expect(normalized!.parts[0].title).toBe("Listening");
		expect(normalized!.parts[1].title).toBe("Grammar & Vocabulary");
		expect(normalized!.parts[2].title).toBe("Reading");
		expect(normalized!.parts[2].passages).toHaveLength(6);
		expect(normalized!.parts[3].title).toBe("Writing");
		expect(normalized!.parts[3].promptTitle).toBe("Email to a friend");
		expect(normalized!.parts[3].minWords).toBe(50);
		expect(normalized!.parts[3].maxWords).toBe(80);
		expect(normalized!.parts[4].title).toBe("Speaking");
		expect(normalized!.parts[4].tasks).toHaveLength(8);
	});

	it("Speaking task hỗ trợ audioId tùy chọn: buildPlacementSnapshot chuyển thành src không rò rỉ audioId và extractReferencedAudioIds giữ cả Speaking audio", () => {
		const content = makeValidContent();
		content.parts[4].tasks.push({
			id: "s-02",
			partLabel: "Part 2",
			level: "B1",
			prompt: "Describe your favorite book.",
			prepSeconds: 15,
			answerSeconds: 45,
			audioId: SAMPLE_AUDIO_ID_2,
		});

		const published = buildPlacementSnapshot(content, 7);
		expect(JSON.stringify(published)).not.toContain("audioId");
		expect(published.parts[4].tasks[0]?.src).toBe("");
		expect(published.parts[4].tasks[1]?.src).toBe(
			`/public/placement-test/audio/${SAMPLE_AUDIO_ID_2}`,
		);

		const normalized = normalizePublishedPlacementSnapshot(published);
		expect(normalized?.parts[4].tasks[0]?.src).toBe("");
		expect(normalized?.parts[4].tasks[1]?.src).toBe(
			`/public/placement-test/audio/${SAMPLE_AUDIO_ID_2}`,
		);

		// Snapshot cũ chưa có field src trên Speaking task vẫn chuẩn hóa về src = ""
		const legacyV2WithoutSpeakingSrc = {
			...published,
			parts: [
				published.parts[0],
				published.parts[1],
				published.parts[2],
				published.parts[3],
				{
					id: "speaking",
					title: "Speaking",
					tasks: [
						{
							id: "s-old",
							partLabel: "Part 1",
							level: "A1",
							prompt: "Old question",
							prepSeconds: 5,
							answerSeconds: 20,
						},
					],
				},
			],
		};
		const normalizedLegacyV2 = normalizePublishedPlacementSnapshot(
			legacyV2WithoutSpeakingSrc,
		);
		expect(normalizedLegacyV2?.parts[4].tasks[0]?.src).toBe("");

		const refs = extractReferencedAudioIds(
			JSON.stringify(content),
			JSON.stringify(published),
		);
		expect([...refs].sort()).toEqual(
			[SAMPLE_AUDIO_ID, SAMPLE_AUDIO_ID_2].sort(),
		);
	});

	it("matchPlacementBand và computePlacementFinal giữ số thực trước khi khớp band (không làm tròn nhảy bậc sai ở biên)", () => {
		const content = makeValidContent();
		const snapshot = buildPlacementSnapshot(content, 1);
		expect(matchPlacementBand(67.6, snapshot.bands).cefr).toBe("A2");
		expect(matchPlacementBand(68.0, snapshot.bands).cefr).toBe("A2+ / B1 thấp");

		// L = 9/13 (69.23%), G&V = 8/12 (66.67%), R = 10/15 (66.67%), W = 6.0/9 (66.67%), S = 6.3->6.0/9 -> dùng W=6.0 (66.67%), S=6.5 (72.22%) vs legacy:
		// Kiểm tra số thực: L = 9/13 (69.23%), G&V = 8/12 (66.67%), R = 10/15 (66.67%), W = 6.0/9 (66.67%), S = 6.0/9 (66.67%) -> avg = 67.18% (< 68 -> A2)
		const finalRes = computePlacementFinal({
			objective: {
				listening: { correct: 9, total: 13, pct: 69 },
				vocabGrammar: { correct: 8, total: 12, pct: 67 },
				reading: { correct: 10, total: 15, pct: 67 },
			},
			bands: snapshot.bands,
			writingScore: 6,
			speakingScore: 6,
		});
		expect(finalRes.averagePct).toBe(67);
		expect(finalRes.band.cefr).toBe("A2");

		// Biên sát 68: W = 6.0 (66.67%), S = 6.5 (72.22%) -> avg = 68.29% >= 68 -> A2+ / B1 thấp
		const upperRes = computePlacementFinal({
			objective: {
				listening: { correct: 9, total: 13, pct: 69 },
				vocabGrammar: { correct: 8, total: 12, pct: 67 },
				reading: { correct: 10, total: 15, pct: 67 },
			},
			bands: snapshot.bands,
			writingScore: 6,
			speakingScore: 6.5,
		});
		expect(upperRes.averagePct).toBe(68);
		expect(upperRes.band.cefr).toBe("A2+ / B1 thấp");

		// Legacy parse & type guards
		const legacyW = parseStoredWritingRubric('{"ct":4,"or":4,"lg":3}');
		const ieltsW = parseStoredWritingRubric(
			'{"task":6.5,"coherence":6,"lexical":6.5,"grammar":6}',
		);
		expect(isIeltsWritingRubric(legacyW)).toBe(false);
		expect(isIeltsWritingRubric(ieltsW)).toBe(true);
		const legacyS = parseStoredSpeakingRubric('{"gv":3,"dm":3,"pr":3,"ic":3}');
		const ieltsS = parseStoredSpeakingRubric(
			'{"fluency":6,"lexical":6.5,"grammar":6,"pronunciation":7}',
		);
		expect(isIeltsSpeakingRubric(legacyS)).toBe(false);
		expect(isIeltsSpeakingRubric(ieltsS)).toBe(true);
	});

	it("seed questions.json và rubric 5/3/1 đầy đủ cấu trúc chuẩn trên mọi môi trường (kể cả CI)", () => {
		const seedPath = fileURLToPath(
			new URL(
				"../../../apps/web/public/placement-seed/questions.json",
				import.meta.url,
			).href,
		);
		const seed = placementContentSchema.parse(
			JSON.parse(readFileSync(seedPath, "utf8")),
		);
		expect(seed.bands.map((b) => [b.min, b.max, b.cefr])).toEqual([
			[0, 29, "Pre-A1"],
			[30, 54, "A1"],
			[55, 67, "A2"],
			[68, 84, "A2+ / B1 thấp"],
			[85, 100, "B1 trở lên"],
		]);
		expect(
			seed.parts[0].clips.reduce((s, c) => s + c.questions.length, 0),
		).toBe(13);
		expect(seed.parts[1].questions).toHaveLength(12);
		expect(
			seed.parts[2].passages.reduce((s, p) => s + p.questions.length, 0),
		).toBe(15);
		expect(seed.parts[4].tasks).toHaveLength(8);
		for (const item of [
			...PLACEMENT_LEGACY_WRITING_RUBRIC,
			...PLACEMENT_LEGACY_SPEAKING_RUBRIC,
		]) {
			expect(item.levels[5].length).toBeGreaterThan(0);
			expect(item.levels[3].length).toBeGreaterThan(0);
			expect(item.levels[1].length).toBeGreaterThan(0);
		}
		expect(PLACEMENT_WRITING_RUBRIC.map((r) => r.key)).toEqual([
			"task",
			"coherence",
			"lexical",
			"grammar",
		]);
		expect(PLACEMENT_SPEAKING_RUBRIC.map((r) => r.key)).toEqual([
			"fluency",
			"lexical",
			"grammar",
			"pronunciation",
		]);
	});

	const htmlPath = fileURLToPath(
		new URL("../../../raw-data/placement-test-audio.html", import.meta.url)
			.href,
	);
	it.skipIf(!existsSync(htmlPath))(
		"questions.json và rubric khớp tuyệt đối với raw-data/placement-test-audio.html (local source)",
		() => {
			const seedPath = fileURLToPath(
				new URL(
					"../../../apps/web/public/placement-seed/questions.json",
					import.meta.url,
				).href,
			);
			const html = readFileSync(htmlPath, "utf8");
			const script =
				html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1] ?? "";
			const dataOnly =
				script.split(
					"/* =====================================================================\n   ỨNG DỤNG",
				)[0] ?? "";
			const sandbox: Record<string, unknown> = {};
			runInNewContext(
				`${dataOnly}\nthis.__OUT = { LISTENING, GV, READING, WRITING_PROMPT, SPEAKING_TASKS, WRITING_RUBRIC, SPEAKING_RUBRIC, BANDS };`,
				sandbox,
			);
			const raw = sandbox.__OUT as {
				LISTENING: Array<{
					id: string;
					part: string;
					instr?: string;
					notesTitle?: string;
					items: Array<{
						type?: string;
						lvl: string;
						q?: string;
						label?: string;
						opts?: string[];
						a?: number;
						accept?: string[];
					}>;
				}>;
				GV: Array<{ lvl: string; q: string; opts: string[]; a: number }>;
				READING: Array<{
					id: string;
					part: string;
					instr?: string;
					title?: string;
					text: string;
					items: Array<{ lvl: string; q: string; opts: string[]; a: number }>;
				}>;
				WRITING_PROMPT: { title: string; text: string };
				SPEAKING_TASKS: Array<{
					part: string;
					lvl: string;
					prep: number;
					answer: number;
					q: string;
				}>;
				WRITING_RUBRIC: Array<{
					key: string;
					name: string;
					hint: string;
					d: { 5: string; 3: string; 1: string };
				}>;
				SPEAKING_RUBRIC: Array<{
					key: string;
					name: string;
					hint: string;
					d: { 5: string; 3: string; 1: string };
				}>;
				BANDS: Array<{
					min: number;
					cefr: string;
					course: string;
					advice: string;
				}>;
			};

			const seed = placementContentSchema.parse(
				JSON.parse(readFileSync(seedPath, "utf8")),
			);

			expect(
				seed.bands.map((b) => ({
					min: b.min,
					cefr: b.cefr,
					displayCourse: b.displayCourse,
					advice: b.advice,
				})),
			).toEqual(
				raw.BANDS.map((b) => ({
					min: b.min,
					cefr: b.cefr,
					displayCourse: b.course,
					advice: b.advice,
				})),
			);

			expect(seed.parts[0].clips).toHaveLength(raw.LISTENING.length);
			seed.parts[0].clips.forEach((clip, idx) => {
				const rc = raw.LISTENING[idx]!;
				expect(clip.partLabel).toBe(rc.part);
				expect(clip.instruction).toBe(rc.instr ?? "");
				expect(clip.notesTitle).toBe(rc.notesTitle ?? "");
				expect(clip.questions).toHaveLength(rc.items.length);
				clip.questions.forEach((q, qIdx) => {
					const ri = rc.items[qIdx]!;
					expect(q.level).toBe(ri.lvl);
					expect(q.prompt).toBe(ri.q ?? ri.label ?? "");
					if (q.type === "gap") {
						expect(q.accept).toEqual(ri.accept);
					} else {
						expect(q.options).toEqual(ri.opts);
						expect(q.answer).toBe(ri.a);
					}
				});
			});

			expect(seed.parts[1].questions).toHaveLength(raw.GV.length);
			seed.parts[1].questions.forEach((q, idx) => {
				const rq = raw.GV[idx]!;
				expect(q.level).toBe(rq.lvl);
				expect(q.prompt).toBe(rq.q);
				expect(q.options).toEqual(rq.opts);
				expect(q.answer).toBe(rq.a);
			});

			expect(seed.parts[2].passages).toHaveLength(raw.READING.length);
			seed.parts[2].passages.forEach((p, idx) => {
				const rp = raw.READING[idx]!;
				expect(p.partLabel).toBe(rp.part);
				expect(p.instruction).toBe(rp.instr ?? "");
				expect(p.body).toBe(rp.text);
				expect(p.questions).toHaveLength(rp.items.length);
				p.questions.forEach((q, qIdx) => {
					const ri = rp.items[qIdx]!;
					expect(q.level).toBe(ri.lvl);
					expect(q.prompt).toBe(ri.q);
					expect(q.options).toEqual(ri.opts);
					expect(q.answer).toBe(ri.a);
				});
			});

			expect(seed.parts[3].promptTitle).toBe(raw.WRITING_PROMPT.title);
			expect(seed.parts[3].promptBody).toBe(raw.WRITING_PROMPT.text);

			expect(seed.parts[4].tasks).toHaveLength(raw.SPEAKING_TASKS.length);
			seed.parts[4].tasks.forEach((t, idx) => {
				const rs = raw.SPEAKING_TASKS[idx]!;
				expect(t.partLabel).toBe(rs.part);
				expect(t.level).toBe(rs.lvl);
				expect(t.prepSeconds).toBe(rs.prep);
				expect(t.answerSeconds).toBe(rs.answer);
				expect(t.prompt).toBe(rs.q);
			});

			expect(
				PLACEMENT_LEGACY_WRITING_RUBRIC.map((r) => ({
					key: r.key,
					label: r.label,
					desc: r.desc,
					levels: r.levels,
				})),
			).toEqual(
				raw.WRITING_RUBRIC.map((r) => ({
					key: r.key,
					label: r.name,
					desc: r.hint,
					levels: r.d,
				})),
			);
			expect(
				PLACEMENT_LEGACY_SPEAKING_RUBRIC.map((r) => ({
					key: r.key,
					label: r.label,
					levels: r.levels,
				})),
			).toEqual(
				raw.SPEAKING_RUBRIC.map((r) => ({
					key: r.key,
					label: r.name,
					levels: r.d,
				})),
			);
		},
	);

	it("hasPlacementSpeakingTasks và submit schemas từ chối speakingMode='skipped'", () => {
		const content = makeValidContent();
		const snapshot = buildPlacementSnapshot(content, 1);
		expect(hasPlacementSpeakingTasks(snapshot)).toBe(true);

		const withoutSpeaking = {
			...snapshot,
			parts: [
				snapshot.parts[0],
				snapshot.parts[1],
				snapshot.parts[2],
				snapshot.parts[3],
				{ ...snapshot.parts[4], tasks: [] },
			] as typeof snapshot.parts,
		};
		expect(hasPlacementSpeakingTasks(withoutSpeaking)).toBe(false);

		expect(
			studentPlacementSubmitSchema.safeParse({
				answers: { listening: {}, vocabGrammar: {}, reading: {} },
				writingText: "",
				speakingMode: "skipped",
			}).success,
		).toBe(false);
		expect(
			placementPublicSubmitSchema.safeParse({
				lead: { name: "Học viên", phone: "0901234567" },
				answers: { listening: {}, vocabGrammar: {}, reading: {} },
				writingText: "",
				speakingMode: "skipped",
			}).success,
		).toBe(false);
		expect(
			studentPlacementSubmitSchema.safeParse({
				answers: { listening: {}, vocabGrammar: {}, reading: {} },
				writingText: "",
				speakingMode: "upload",
			}).success,
		).toBe(true);
	});

	it("detectSpeakingAudioMimeFromBytes nhận diện đúng magic bytes audio và từ chối ảnh/payload lạ", () => {
		const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0));
		const makeFtyp = (brand: string, size = 24) => {
			const buf = new Uint8Array(Math.max(16, size));
			const view = new DataView(buf.buffer);
			view.setUint32(0, size, false);
			buf.set(ascii("ftyp"), 4);
			buf.set(ascii(brand), 8);
			return buf;
		};

		// WAV: RIFF....WAVE và RF64....WAVE
		const riffWav = new Uint8Array([
			...ascii("RIFF"),
			0x24,
			0x00,
			0x00,
			0x00,
			...ascii("WAVE"),
			...ascii("fmt "),
		]);
		expect(detectSpeakingAudioMimeFromBytes(riffWav)).toBe("audio/wav");

		const rf64Wav = new Uint8Array([
			...ascii("RF64"),
			0xff,
			0xff,
			0xff,
			0xff,
			...ascii("WAVE"),
			...ascii("ds64"),
		]);
		expect(detectSpeakingAudioMimeFromBytes(rf64Wav)).toBe("audio/wav");

		const riffWebp = new Uint8Array([
			...ascii("RIFF"),
			0x24,
			0x00,
			0x00,
			0x00,
			...ascii("WEBP"),
		]);
		expect(detectSpeakingAudioMimeFromBytes(riffWebp)).toBeNull();

		// ISO BMFF ftyp: audio brands hợp lệ, 64-bit extended size, subarray có byteOffset
		expect(detectSpeakingAudioMimeFromBytes(makeFtyp("M4A "))).toBe(
			"audio/mp4",
		);
		expect(detectSpeakingAudioMimeFromBytes(makeFtyp("isom"))).toBe(
			"audio/mp4",
		);
		expect(detectSpeakingAudioMimeFromBytes(makeFtyp("mp42"))).toBe(
			"audio/mp4",
		);

		const ext64Ftyp = new Uint8Array(24);
		const extView = new DataView(ext64Ftyp.buffer);
		extView.setUint32(0, 1, false);
		ext64Ftyp.set(ascii("ftyp"), 4);
		extView.setUint32(8, 0, false);
		extView.setUint32(12, 24, false);
		ext64Ftyp.set(ascii("M4A "), 16);
		expect(detectSpeakingAudioMimeFromBytes(ext64Ftyp)).toBe("audio/mp4");

		const padded = new Uint8Array(32);
		padded.set(makeFtyp("M4A ", 16), 8);
		expect(detectSpeakingAudioMimeFromBytes(padded.subarray(8, 24))).toBe(
			"audio/mp4",
		);

		// Banned image ftyp brands và ftyp size không hợp lệ
		for (const banned of [
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
			expect(detectSpeakingAudioMimeFromBytes(makeFtyp(banned))).toBeNull();
		}
		expect(detectSpeakingAudioMimeFromBytes(makeFtyp("M4A ", 12))).toBeNull();
		expect(detectSpeakingAudioMimeFromBytes(makeFtyp("M4A ", 18))).toBeNull();

		// WebM (EBML)
		expect(
			detectSpeakingAudioMimeFromBytes(
				new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f]),
			),
		).toBe("audio/webm");

		// OggS
		expect(
			detectSpeakingAudioMimeFromBytes(
				new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0x00]),
			),
		).toBe("audio/ogg");

		// MP3: ID3 tag và MPEG Layer 3 frame sync
		expect(
			detectSpeakingAudioMimeFromBytes(
				new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00]),
			),
		).toBe("audio/mpeg");
		expect(
			detectSpeakingAudioMimeFromBytes(
				new Uint8Array([0xff, 0xfb, 0x90, 0x00]),
			),
		).toBe("audio/mpeg");

		// AAC: ADTS frame sync
		expect(
			detectSpeakingAudioMimeFromBytes(
				new Uint8Array([0xff, 0xf1, 0x50, 0x80]),
			),
		).toBe("audio/aac");

		// Buffer ngắn hoặc payload lạ (HTML) -> null
		expect(
			detectSpeakingAudioMimeFromBytes(new Uint8Array([0x1a, 0x45, 0xdf])),
		).toBeNull();
		expect(
			detectSpeakingAudioMimeFromBytes(new TextEncoder().encode("<html>")),
		).toBeNull();
	});

	it("resolvePlacementSpeakingUploadMeta ưu tiên magic bytes hơn MIME trình duyệt và chuẩn hoá đủ các alias audio", () => {
		const mp4Head = new Uint8Array([
			0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
			0x00, 0x00, 0x00, 0x00,
		]);
		const webmHead = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f]);

		// Magic bytes MP4 ghi đè nhãn sai từ trình duyệt (audio/webm, video/mp4, rỗng)
		expect(resolvePlacementSpeakingUploadMeta("audio/webm", mp4Head)).toEqual({
			contentType: "audio/mp4",
			filename: "speaking.m4a",
		});
		expect(
			resolvePlacementSpeakingUploadMeta("video/mp4;codecs=mp4a.40.2", mp4Head),
		).toEqual({
			contentType: "audio/mp4",
			filename: "speaking.m4a",
		});
		expect(resolvePlacementSpeakingUploadMeta("", mp4Head)).toEqual({
			contentType: "audio/mp4",
			filename: "speaking.m4a",
		});

		// Magic bytes WebM ghi đè chuỗi rỗng
		expect(resolvePlacementSpeakingUploadMeta("", webmHead)).toEqual({
			contentType: "audio/webm",
			filename: "speaking.webm",
		});

		// Fallback theo blobType khi không có headBytes hoặc không nhận diện được
		expect(
			resolvePlacementSpeakingUploadMeta("video/mp4; codecs=avc1"),
		).toEqual({
			contentType: "audio/mp4",
			filename: "speaking.m4a",
		});
		expect(resolvePlacementSpeakingUploadMeta("audio/x-m4a", null)).toEqual({
			contentType: "audio/mp4",
			filename: "speaking.m4a",
		});
		expect(resolvePlacementSpeakingUploadMeta("audio/mp4a-latm")).toEqual({
			contentType: "audio/mp4",
			filename: "speaking.m4a",
		});
		expect(
			resolvePlacementSpeakingUploadMeta("audio/webm;codecs=opus"),
		).toEqual({
			contentType: "audio/webm",
			filename: "speaking.webm",
		});
		expect(resolvePlacementSpeakingUploadMeta("video/webm")).toEqual({
			contentType: "audio/webm",
			filename: "speaking.webm",
		});
		expect(resolvePlacementSpeakingUploadMeta("audio/x-opus+ogg")).toEqual({
			contentType: "audio/ogg",
			filename: "speaking.ogg",
		});
		expect(resolvePlacementSpeakingUploadMeta("application/ogg")).toEqual({
			contentType: "audio/ogg",
			filename: "speaking.ogg",
		});
		expect(resolvePlacementSpeakingUploadMeta("audio/mp3")).toEqual({
			contentType: "audio/mpeg",
			filename: "speaking.mp3",
		});
		expect(resolvePlacementSpeakingUploadMeta("audio/vnd.wave")).toEqual({
			contentType: "audio/wav",
			filename: "speaking.wav",
		});
		expect(resolvePlacementSpeakingUploadMeta("audio/adts")).toEqual({
			contentType: "audio/aac",
			filename: "speaking.aac",
		});

		// Chuỗi rỗng, MIME không hỗ trợ hoặc khóa prototype → mặc định audio/webm
		expect(resolvePlacementSpeakingUploadMeta("")).toEqual({
			contentType: "audio/webm",
			filename: "speaking.webm",
		});
		expect(
			resolvePlacementSpeakingUploadMeta(
				"application/octet-stream",
				new Uint8Array([0x00, 0x01, 0x02, 0x03]),
			),
		).toEqual({
			contentType: "audio/webm",
			filename: "speaking.webm",
		});
		expect(resolvePlacementSpeakingUploadMeta("toString")).toEqual({
			contentType: "audio/webm",
			filename: "speaking.webm",
		});
	});

	it("isLikelyInAppBrowser phát hiện WebView di động phổ biến và bỏ qua trình duyệt thường", () => {
		const inAppAgents = [
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Zalo/24.02.01",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) [FBAN/FBIOS;FBAV/450.0.0]",
			"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 FB_IAB/FB4A",
			"Mozilla/5.0 (iPhone) MessengerForiOS/440.0",
			"Mozilla/5.0 (iPhone) Instagram 318.0.0.21.109",
			"Mozilla/5.0 (Linux; Android 13) Line/13.20.0",
			"Mozilla/5.0 (Linux; Android 13) BytedanceWebview/d8a21c6",
			"Mozilla/5.0 (iPhone) musical_ly_33.5.0",
			"Mozilla/5.0 (iPhone) TikTok 33.5.0",
		];
		for (const ua of inAppAgents) {
			expect(isLikelyInAppBrowser(ua)).toBe(true);
		}

		const standardAgents = [
			"",
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
			"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
			"Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0 online-reader/1.0",
		];
		for (const ua of standardAgents) {
			expect(isLikelyInAppBrowser(ua)).toBe(false);
		}
	});
});
