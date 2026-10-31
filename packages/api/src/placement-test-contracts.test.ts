import { describe, expect, it } from "vitest";
import { LEAD_COURSE_LABELS } from "./lead-contracts";
import {
	buildPlacementSnapshot,
	extractReferencedAudioIds,
	type PlacementContent,
	placementContentSchema,
	validatePlacementForPublish,
} from "./placement-test-contracts";

const SAMPLE_AUDIO_ID = "11111111-1111-4111-8111-111111111111";
const SAMPLE_AUDIO_ID_2 = "22222222-2222-4222-8222-222222222222";

function makeValidContent(): PlacementContent {
	return {
		bands: [
			{ min: 0, max: 1, cefr: "A1", course: "ielts-foundation" },
			{ min: 2, max: 2, cefr: "B1", course: "ielts-pre" },
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
						prompt: "She ______ to work every day.",
						options: ["go", "goes", "going", "went"],
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
						level: "A2",
						title: "Đoạn nghe 1",
						questions: [
							{
								id: "l-01",
								level: "A2",
								prompt: "Where does the speaker work?",
								options: ["Library", "Bank", "School", "Hospital"],
								answer: 0,
							},
						],
					},
				],
			},
		],
	};
}

describe("placement-test-contracts", () => {
	it("cho phép lưu nháp dở (answer: null, audioId: null, prompt rỗng)", () => {
		const draft = makeValidContent();
		draft.parts[0].questions[0]!.answer = null;
		draft.parts[0].questions[0]!.prompt = "";
		draft.parts[1].clips[0]!.audioId = null;

		const parsed = placementContentSchema.safeParse(draft);
		expect(parsed.success).toBe(true);
	});

	it("từ chối id không hợp lệ hoặc tổng số câu vượt quá 100", () => {
		const invalidId = makeValidContent();
		invalidId.parts[0].questions[0]!.id = "bad id/with spaces";
		expect(placementContentSchema.safeParse(invalidId).success).toBe(false);

		const tooMany = makeValidContent();
		tooMany.parts[0].questions = Array.from({ length: 90 }, (_, idx) => ({
			id: `vg-${idx + 1}`,
			kind: "grammar" as const,
			level: "A1",
			prompt: `Q ${idx}`,
			options: ["a", "b", "c", "d"] as [string, string, string, string],
			answer: 0,
		}));
		tooMany.parts[1].clips[0]!.questions = Array.from(
			{ length: 15 },
			(_, idx) => ({
				id: `l-${idx + 1}`,
				level: "A2",
				prompt: `L ${idx}`,
				options: ["a", "b", "c", "d"] as [string, string, string, string],
				answer: 1,
			}),
		);
		expect(placementContentSchema.safeParse(tooMany).success).toBe(false);
	});

	it("validatePlacementForPublish chấp nhận đề hợp lệ", () => {
		const issues = validatePlacementForPublish(makeValidContent());
		expect(issues).toEqual([]);
	});

	it("validatePlacementForPublish bắt ngưỡng hở, ngưỡng chồng và ngưỡng không tới tổng điểm", () => {
		const gapped = makeValidContent();
		gapped.bands = [
			{ min: 0, max: 0, cefr: "A1", course: "ielts-foundation" },
			{ min: 2, max: 2, cefr: "B1", course: "ielts-pre" },
		];
		expect(validatePlacementForPublish(gapped)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: "bands.1.min" }),
			]),
		);

		const overlapped = makeValidContent();
		overlapped.bands = [
			{ min: 0, max: 1, cefr: "A1", course: "ielts-foundation" },
			{ min: 1, max: 2, cefr: "B1", course: "ielts-pre" },
		];
		expect(validatePlacementForPublish(overlapped)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: "bands.1.min" }),
			]),
		);

		const shortMax = makeValidContent();
		shortMax.bands = [
			{ min: 0, max: 1, cefr: "A1", course: "ielts-foundation" },
		];
		expect(validatePlacementForPublish(shortMax)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: "bands.0.max" }),
			]),
		);
	});

	it("validatePlacementForPublish bắt course lạ, đáp án trùng, thiếu answer, đoạn thiếu audio", () => {
		const invalid = makeValidContent();
		invalid.bands[0]!.course = "unknown-course";
		invalid.parts[0].questions[0]!.options = ["same", "same", "c", "d"];
		invalid.parts[0].questions[0]!.answer = null;
		invalid.parts[1].clips[0]!.audioId = null;

		const issues = validatePlacementForPublish(invalid);
		const paths = issues.map((i) => i.path);
		expect(paths).toContain("bands.0.course");
		expect(paths).toContain("parts.0.questions.0.options");
		expect(paths).toContain("parts.0.questions.0.answer");
		expect(paths).toContain("parts.1.clips.0.audioId");
	});

	it("buildPlacementSnapshot gắn courseLabel, đổi audioId thành src và không lộ audioId", () => {
		const content = makeValidContent();
		const snapshot = buildPlacementSnapshot(content, 3);

		expect(snapshot.version).toBe(3);
		expect(snapshot.bands[1]?.courseLabel).toBe(
			LEAD_COURSE_LABELS["ielts-pre"],
		);
		expect(snapshot.parts[1].clips[0]?.src).toBe(
			`/public/placement-test/audio/${SAMPLE_AUDIO_ID}`,
		);
		expect("audioId" in (snapshot.parts[1].clips[0] ?? {})).toBe(false);
		expect(JSON.stringify(snapshot)).not.toContain("audioId");
	});

	it("extractReferencedAudioIds đọc được cả audioId trong draft và src trong published snapshot", () => {
		const draft = makeValidContent();
		const published = buildPlacementSnapshot(draft, 1);
		draft.parts[1].clips[0]!.audioId = SAMPLE_AUDIO_ID_2;

		const ids = extractReferencedAudioIds(
			JSON.stringify(draft),
			JSON.stringify(published),
		);
		expect([...ids].sort()).toEqual(
			[SAMPLE_AUDIO_ID, SAMPLE_AUDIO_ID_2].sort(),
		);
	});
});
