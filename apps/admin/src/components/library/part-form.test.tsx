// @vitest-environment jsdom
import type { LibraryPartDto } from "@teacher-os/api/library-contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
	arePartValuesEqual,
	BAND_OPTIONS,
	emptyPartValue,
	isPartDirty,
	normalizeQuestions,
	PartForm,
	partInputFromValue,
	partReadyIssues,
	partValueFromDto,
	reconcilePartDraftsOnSaveSuccess,
	slotTypes,
} from "./part-form";

const partDto: LibraryPartDto = {
	id: "part-1",
	testId: "t1",
	part: "p1",
	type: "tfng",
	title: "Passage 1",
	band: "6.5",
	source: "Cambridge 18",
	intro: "<p>Câu lệnh</p>",
	passage: "<p>Đoạn văn đọc</p>",
	transcript: "",
	imageUrl: "",
	questions: [
		{
			stem: "Câu 1",
			opts: null,
			answer: "True",
			alts: "",
			type: null,
			pin: null,
		},
	],
	optionBank: [],
	groups: [],
	note: "",
	audio: null,
	updatedAt: "2026-10-02T00:00:00.000Z",
};

describe("arePartValuesEqual", () => {
	it("trả về true khi hai PartFormValue có cùng nội dung", () => {
		const a = partValueFromDto(partDto);
		const b = partValueFromDto(partDto);
		expect(arePartValuesEqual(a, b)).toBe(true);
	});

	it("trả về false khi khác bất kỳ trường nào (title, passage, questions)", () => {
		const base = partValueFromDto(partDto);
		expect(arePartValuesEqual(base, { ...base, title: "Title khác" })).toBe(
			false,
		);
		expect(
			arePartValuesEqual(base, { ...base, passage: "<p>Passage mới</p>" }),
		).toBe(false);
		expect(
			arePartValuesEqual(base, {
				...base,
				questions: [
					{
						stem: "Câu hỏi sửa",
						opts: null,
						answer: "True",
						alts: "",
						type: null,
						pin: null,
					},
				],
			}),
		).toBe(false);
	});
});

describe("reconcilePartDraftsOnSaveSuccess", () => {
	it("xóa draft khi draft hiện tại bằng đúng snapshot đã gửi", () => {
		const snapshot = partValueFromDto(partDto);
		const drafts = new Map([
			["p1", { dirty: true, value: snapshot }],
			["p2", { dirty: true, value: emptyPartValue("reading", "p2") }],
		]);

		const next = reconcilePartDraftsOnSaveSuccess(drafts, "p1", snapshot);
		expect(next.has("p1")).toBe(false);
		expect(next.has("p2")).toBe(true);
	});

	it("giữ lại draft với dirty=true khi người dùng đã gõ thêm ký tự mới khác snapshot", () => {
		const snapshot = partValueFromDto(partDto);
		const typedValue = { ...snapshot, title: "Passage 1 đã gõ thêm" };
		const drafts = new Map([["p1", { dirty: true, value: typedValue }]]);

		const next = reconcilePartDraftsOnSaveSuccess(drafts, "p1", snapshot);
		expect(next.has("p1")).toBe(true);
		expect(next.get("p1")).toEqual({ dirty: true, value: typedValue });
	});

	it("giữ lại draft với dirty=true kể cả khi draft ban đầu có dirty=false nhưng khác snapshot", () => {
		const snapshot = partValueFromDto(partDto);
		const differentValue = { ...snapshot, title: "Tiêu đề cũ trước khi sửa" };
		const drafts = new Map([["p1", { dirty: false, value: differentValue }]]);

		const next = reconcilePartDraftsOnSaveSuccess(drafts, "p1", snapshot);
		expect(next.has("p1")).toBe(true);
		expect(next.get("p1")).toEqual({ dirty: true, value: differentValue });
	});

	it("xóa draft khi người dùng gõ thêm rồi undo về đúng snapshot", () => {
		const snapshot = partValueFromDto(partDto);
		const drafts = new Map([["p1", { dirty: false, value: snapshot }]]);

		const next = reconcilePartDraftsOnSaveSuccess(drafts, "p1", snapshot);
		expect(next.has("p1")).toBe(false);
	});

	it("không làm gì và giữ nguyên reference khi slot không có draft trong map", () => {
		const drafts = new Map([
			["p2", { dirty: true, value: emptyPartValue("reading", "p2") }],
		]);
		const snapshot = partValueFromDto(partDto);

		const next = reconcilePartDraftsOnSaveSuccess(drafts, "p1", snapshot);
		expect(next).toBe(drafts);
	});
});

describe("slotTypes / emptyPartValue", () => {
	it("dạng bài theo catalog skill (p1 reading)", () => {
		expect(slotTypes("reading", "p1")).toEqual([
			"tfng",
			"sent",
			"note",
			"shortans",
			"diagram",
		]);
		expect(slotTypes("listening", "s1")).toEqual(["form", "mcq1"]);
	});

	it("part rỗng có 1 câu với shape của dạng mặc định", () => {
		const empty = emptyPartValue("reading", "p1");
		expect(empty.type).toBe("tfng");
		expect(empty.questions).toHaveLength(1);
		expect(empty.questions[0]).toMatchObject({
			stem: "",
			answer: "",
			opts: null,
			pin: null,
		});
		expect(BAND_OPTIONS).toEqual(["6.0", "6.5", "7.0", "7.5"]);
	});
});

describe("normalizeQuestions", () => {
	it("câu hợp lệ đi qua nguyên văn; câu lỗi → item rỗng giữ dạng", () => {
		const questions = normalizeQuestions([
			{
				stem: "Câu ok",
				opts: ["A", "B"],
				answer: "A",
				alts: "",
				type: "mcq",
				pin: null,
			},
			{ stem: "hỏng", opts: 7 },
		]);
		expect(questions[0]).toMatchObject({ stem: "Câu ok", type: "mcq" });
		expect(questions[1]).toMatchObject({ stem: "", answer: "" });
	});
});

describe("isPartDirty", () => {
	it("part rỗng chưa sửa → false; gõ tiêu đề → true", () => {
		const empty = emptyPartValue("reading", "p1");
		expect(isPartDirty("reading", "p1", null, empty)).toBe(false);
		expect(isPartDirty("reading", "p1", null, { ...empty, title: "Mới" })).toBe(
			true,
		);
	});

	it("round-trip từ DTO đã lưu → false", () => {
		const value = partValueFromDto(partDto);
		expect(isPartDirty("reading", "p1", partDto, value)).toBe(false);
		expect(
			isPartDirty("reading", "p1", partDto, { ...value, title: "Đổi" }),
		).toBe(true);
	});
});

describe("partInputFromValue", () => {
	it("input hợp lệ parse qua libraryPartUpsertSchema với part khớp slot", () => {
		const built = partInputFromValue("p1", partValueFromDto(partDto));
		if (!built.ok) throw new Error(JSON.stringify(built.errors));
		expect(built.input.part).toBe("p1");
		expect(built.input.questions).toHaveLength(1);
	});

	it("tiêu đề trống → lỗi field tiếng Việt", () => {
		const built = partInputFromValue("p1", {
			...emptyPartValue("reading", "p1"),
			title: "   ",
		});
		expect(built.ok).toBe(false);
		if (!built.ok) expect(built.errors.title).toMatch(/1–200/);
	});
});

describe("partReadyIssues (canSave = validatePartForReady)", () => {
	it("reading thiếu passage + không có câu → 2 lý do", () => {
		const issues = partReadyIssues(
			"reading",
			"p1",
			emptyPartValue("reading", "p1"),
		);
		const paths = issues.map((issue) => issue.path).sort();
		expect(paths).toContain("passage");
		expect(paths).toContain("questions");
	});

	it("listening thiếu audio → lý do audio", () => {
		const issues = partReadyIssues(
			"listening",
			"s1",
			emptyPartValue("listening", "s1"),
		);
		expect(issues.map((issue) => issue.path)).toContain("audio");
	});

	it("listening có audio từ saved → không còn lý do audio", () => {
		const listeningVal = {
			...emptyPartValue("listening", "s1"),
			questions: [
				{
					stem: "Question 1",
					opts: null,
					answer: "answer",
					alts: "",
					points: 1,
					order: 1,
				},
			],
		};
		const issues = partReadyIssues(
			"listening",
			"s1",
			listeningVal,
			"track1.mp3",
		);
		expect(issues.map((issue) => issue.path)).not.toContain("audio");
	});

	it("đề đạt đủ (passage + câu có stem) → rỗng", () => {
		const ok = {
			...partValueFromDto(partDto),
			passage: "<p>Đủ dài</p>",
		};
		expect(partReadyIssues("reading", "p1", ok)).toEqual([]);
	});
});

describe("PartForm (render tĩnh)", () => {
	it("nhãn tiếng Việt + danh sách dạng bài của slot", () => {
		const html = renderToStaticMarkup(
			<PartForm
				skill="reading"
				slot="p1"
				slotLabel="Passage 1"
				testId="t1"
				saved={null}
				testReady={false}
				saving={false}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		expect(html).toContain("Tiêu đề part");
		expect(html).toContain("Dạng bài");
		expect(html).toContain("Band điểm");
		expect(html).toContain("Đoạn văn (Passage)");
		expect(html).toContain("Lưu part");
		expect(html).toContain('value="tfng"');
		expect(html).toContain('value="diagram"');
		// reading không có transcript/audio
		expect(html).not.toContain("Transcript (Lời thoại)");
	});

	it("listening hiện transcript + audio", () => {
		const html = renderToStaticMarkup(
			<PartForm
				skill="listening"
				slot="s1"
				slotLabel="Section 1"
				testId="t1"
				saved={null}
				testReady={false}
				saving={false}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		expect(html).toContain("Transcript (Lời thoại)");
		expect(html).toContain("library-audio-dropzone");
		expect(html).toContain("Audio của part");
	});

	it("dạng image-based gợi ý đặt ghim", () => {
		const html = renderToStaticMarkup(
			<PartForm
				skill="reading"
				slot="p1"
				slotLabel="Passage 1"
				testId="t1"
				saved={{
					...partDto,
					type: "diagram",
					imageUrl: "https://cdn.example.com/diagram.png",
				}}
				testReady={false}
				saving={false}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		expect(html).toContain("Dạng bài dùng ảnh");
	});

	it("đề ready khóa xóa part kèm giải thích", () => {
		const html = renderToStaticMarkup(
			<PartForm
				skill="reading"
				slot="p1"
				slotLabel="Passage 1"
				testId="t1"
				saved={partDto}
				testReady
				saving={false}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		expect(html).toContain("hãy hạ về nháp để xóa part");
		expect(html).toContain("hạ về nháp để xóa part hoặc audio");
	});

	it("part đã lưu mới có nút Xóa part", () => {
		const savedHtml = renderToStaticMarkup(
			<PartForm
				skill="reading"
				slot="p1"
				slotLabel="Passage 1"
				testId="t1"
				saved={partDto}
				testReady={false}
				saving={false}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		expect(savedHtml).toContain("Xóa part");
		const emptyHtml = renderToStaticMarkup(
			<PartForm
				skill="reading"
				slot="p1"
				slotLabel="Passage 1"
				testId="t1"
				saved={null}
				testReady={false}
				saving={false}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		expect(emptyHtml).not.toContain("Xóa part");
	});

	it("initialValue (nháp lift ở parent) thắng bản đã lưu khi remount sau lưu/upload audio", () => {
		const draft = {
			...partValueFromDto(partDto),
			title: "Nháp đang soạn",
		};
		const remountedHtml = renderToStaticMarkup(
			<PartForm
				skill="reading"
				slot="p1"
				slotLabel="Passage 1"
				testId="t1"
				saved={partDto}
				testReady={false}
				saving={false}
				initialValue={draft}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		// Nội dung đang gõ phải sống sót qua remount (key theo saved.updatedAt).
		expect(remountedHtml).toContain('value="Nháp đang soạn"');
		// Không có nháp → giữ hành vi cũ: init từ bản đã lưu.
		const savedHtml = renderToStaticMarkup(
			<PartForm
				skill="reading"
				slot="p1"
				slotLabel="Passage 1"
				testId="t1"
				saved={partDto}
				testReady={false}
				saving={false}
				onDraftChange={vi.fn()}
				onAudioChanged={vi.fn()}
				onSave={vi.fn()}
				onDelete={vi.fn()}
				deleting={false}
			/>,
		);
		expect(savedHtml).toContain('value="Passage 1"');
	});
});
