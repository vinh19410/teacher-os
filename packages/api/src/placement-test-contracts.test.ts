import { describe, expect, it } from "vitest";
import { LEAD_COURSE_LABELS } from "./lead-contracts";
import {
	buildPlacementSnapshot,
	buildPlacementZaloText,
	computePlacementFinal,
	countPlacementWords,
	extractReferencedAudioIds,
	gradePlacementObjective,
	normalizePlacementGapAnswer,
	normalizePublishedPlacementSnapshot,
	type PlacementContent,
	placementContentSchema,
	upgradeLegacyPlacementContent,
	validatePlacementForPublish,
} from "./placement-test-contracts";

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

		// Speaking = 2/20 (10% -> Pre-A1, index 0), tổng thể ~80% (A2+/B1 thấp, index 3) => hạ 1 bậc xuống A2 (index 2)!
		const downgraded = computePlacementFinal({
			objective: obj,
			bands: snapshot.bands,
			writingRubric: { ct: 5, or: 5, lg: 5 },
			speakingRubric: { gv: 1, dm: 0, pr: 1, ic: 0 },
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
			writingRubric: { ct: 1, or: 1, lg: 1 },
			speakingRubric: { gv: 5, dm: 5, pr: 5, ic: 5 },
		});
		expect(boosted.note).toContain("cân nhắc lớp cao hơn");

		const zalo = buildPlacementZaloText({
			studentName: "Nguyen An",
			phone: "0901234567",
			objective: obj,
			writingScore: 12,
			speakingScore: 14,
			speakingStatus: "uploaded",
			band: downgraded.band,
			averagePct: downgraded.averagePct,
			note: downgraded.note,
			teacherFeedback: "Cần luyện phát âm âm cuối.",
		});
		expect(zalo).toContain("Nguyen An (0901234567)");
		expect(zalo).toContain("Writing: 12/15");
		expect(zalo).toContain("Speaking: 14/20");
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
		expect(normalized?.bands[0]?.min).toBe(0);
		expect(normalized?.bands[normalized.bands.length - 1]?.max).toBe(100);

		const objective = gradePlacementObjective(normalized!, {
			listening: { "l-1": 1 },
			vocabGrammar: { "vg-1": 1 },
			reading: {},
		});
		expect(objective.listening).toMatchObject({ correct: 1, total: 1 });
		expect(objective.vocabGrammar).toMatchObject({ correct: 1, total: 1 });
		expect(objective.reading).toMatchObject({ correct: 0, total: 0 });
		expect(objective.averagePct).toBe(100);
		expect(objective.provisionalBand.cefr).toBe("B1");

		expect(normalizePublishedPlacementSnapshot({ invalid: true })).toBeNull();
	});
});
