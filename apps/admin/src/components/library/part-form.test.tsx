// @vitest-environment jsdom
import type { LibraryPartDto } from "@teacher-os/api/library-contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { addGroup } from "./group-model";
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
import {
	firstIssueFocusPlan,
	focusKeyOf,
	focusRowId,
	viewStateOnMoveGroup,
	viewStateOnRemoveGroup,
} from "./part-view-state";
import { TestOutline } from "./test-outline";
import { buildTestOutline } from "./test-outline-model";

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

describe("normalizeQuestions — không làm rơi explanation/answerSet (chống data-loss)", () => {
	it("round-trip DTO → partValueFromDto → partInputFromValue giữ explanation/answerSet", () => {
		const dtoWithExtras: LibraryPartDto = {
			...partDto,
			questions: [
				{
					stem: "Câu 1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
					explanation: "<p>Vì sao True</p>",
					answerSet: "khoa-1",
				},
				{
					stem: "Câu 2",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
					answerSet: "khoa-1",
				},
			],
		};
		const value = partValueFromDto(dtoWithExtras);
		expect(value.questions[0]?.explanation).toBe("<p>Vì sao True</p>");
		expect(value.questions[0]?.answerSet).toBe("khoa-1");
		const built = partInputFromValue("p1", value);
		if (!built.ok) throw new Error(JSON.stringify(built.errors));
		expect(built.input.questions[0]).toMatchObject({
			explanation: "<p>Vì sao True</p>",
			answerSet: "khoa-1",
		});
		// isPartDirty phải NHẬN thay đổi explanation (field không bị strip).
		expect(isPartDirty("reading", "p1", dtoWithExtras, value)).toBe(false);
		const edited = {
			...value,
			questions: value.questions.map((q, i) =>
				i === 0 ? { ...q, explanation: "<p>Sửa giải thích</p>" } : q,
			),
		};
		expect(isPartDirty("reading", "p1", dtoWithExtras, edited)).toBe(true);
	});

	it("câu không có explanation/answerSet không thêm key mới", () => {
		const value = partValueFromDto(partDto);
		expect("explanation" in (value.questions[0] ?? {})).toBe(false);
		expect("answerSet" in (value.questions[0] ?? {})).toBe(false);
	});
});

describe("groups trong PartFormValue", () => {
	const groupDto = (id: string, startIndex: number, count: number) => ({
		id,
		type: "tfng",
		instruction: "",
		startIndex,
		count,
		optionBank: [],
		answersInline: false,
		splitContent: false,
		dragDrop: false,
	});

	it("normalizeGroups rebuild key-order cố định → canonical ổn định, không dirty vĩnh viễn", () => {
		// Server xuất group với key order khác client-dựng.
		const shuffled = [
			{
				dragDrop: false,
				splitContent: false,
				answersInline: false,
				optionBank: [],
				count: 2,
				startIndex: 0,
				instruction: "",
				type: "tfng",
				id: "g1",
			},
		];
		const dtoWithGroups: LibraryPartDto = {
			...partDto,
			questions: [
				{
					stem: "Câu 1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "Câu 2",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
			],
			groups: shuffled,
		};
		const value = partValueFromDto(dtoWithGroups);
		expect(value.groups).toEqual([groupDto("g1", 0, 2)]);
		expect(isPartDirty("reading", "p1", dtoWithGroups, value)).toBe(false);
		const built = partInputFromValue("p1", value);
		if (!built.ok) throw new Error(JSON.stringify(built.errors));
		expect(built.input.groups).toHaveLength(1);
	});

	it("lỗi tầng nhóm giữ path dotted đầy đủ (groups.1.startIndex)", () => {
		const value = partValueFromDto(partDto);
		const broken = {
			...value,
			title: "Passage 1",
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
			// Nhóm 2 hở số câu (startIndex 2 thay vì 1) → lỗi contiguous.
			groups: [groupDto("g1", 0, 1), groupDto("g2", 2, 1)],
		};
		const built = partInputFromValue("p1", broken);
		expect(built.ok).toBe(false);
		if (!built.ok) {
			expect(
				Object.keys(built.errors).some((k) => k.startsWith("groups.")),
			).toBe(true);
		}
		const issues = partReadyIssues("reading", "p1", {
			...broken,
			passage: "<p>Đủ</p>",
		});
		expect(issues.some((issue) => issue.path.startsWith("groups."))).toBe(true);
	});
});

describe("PartForm thẻ part (#424 Task 3.4, render tĩnh)", () => {
	const renderForm = (props: Partial<Parameters<typeof PartForm>[0]> = {}) =>
		renderToStaticMarkup(
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
				{...props}
			/>,
		);

	it("hai tab Nội dung / Câu hỏi với badge đếm aria-hidden", () => {
		const html = renderForm();
		expect(html).toContain('role="tablist"');
		expect(html).toContain('aria-label="Các tab Passage 1"');
		expect(html).toContain("Nội dung");
		expect(html).toContain("Câu hỏi");
		// Badge part phẳng đếm số câu (1 câu mặc định) aria-hidden — không vào
		// accessible name.
		expect(html).toMatch(/Câu hỏi<span aria-hidden="true"[^>]*>1<\/span>/);
	});

	it("RS-F1: part có nhóm — badge tab Câu hỏi đếm số NHÓM (không phải số câu)", () => {
		const groupedDto: LibraryPartDto = {
			...partDto,
			questions: [
				{
					stem: "q1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "q2",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "q3",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "q4",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "q5",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
			],
			groups: [
				{
					id: "g1",
					type: "tfng",
					instruction: "",
					startIndex: 0,
					count: 3,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
				{
					id: "g2",
					type: "note",
					instruction: "",
					startIndex: 3,
					count: 2,
					optionBank: [],
					answersInline: true,
					splitContent: false,
					dragDrop: false,
				},
			],
		};
		const html = renderForm({
			saved: groupedDto,
			initialValue: partValueFromDto(groupedDto),
		});
		// 2 nhóm / 5 câu — badge phải là 2 (acceptance #424 dòng 4).
		expect(html).toMatch(/Câu hỏi<span aria-hidden="true"[^>]*>2<\/span>/);
	});

	it("chế độ phẳng: một editor + nút Chia thành nhiều nhóm câu, không hàng thu gọn", () => {
		const html = renderForm();
		expect(html).toContain("Chia thành nhiều nhóm câu");
		expect(html).toContain("Câu hỏi và đáp án đúng");
		expect(html).not.toContain("Thêm nhóm câu");
		expect(html).not.toContain("Tổng số câu của part");
	});

	it("không còn nút Lưu part (dời ra toolbar trang, phase 4)", () => {
		const html = renderForm();
		expect(html).not.toContain("Lưu part");
	});

	it("khôi phục view-state qua initialView sau remount", () => {
		const groupedDto: LibraryPartDto = {
			...partDto,
			questions: [
				{
					stem: "Câu 1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "Câu 2",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "Câu 3",
					opts: null,
					answer: "____",
					alts: "",
					type: null,
					pin: null,
				},
			],
			groups: [
				{
					id: "g1",
					type: "tfng",
					instruction: "",
					startIndex: 0,
					count: 2,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
				{
					id: "g2",
					type: "tfng",
					instruction: "<p>Nhóm sau</p>",
					startIndex: 2,
					count: 1,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
			],
		};
		const initialView = {
			partTab: "questions" as const,
			openGroup: 1,
			groupTabs: { 1: "intro" as const },
			openRowByGroup: { 1: 0 },
		};
		const html = renderForm({ saved: groupedDto, initialView });
		// Tab Câu hỏi của part đang mở.
		expect(html).toContain('aria-selected="true"');
		// Nhóm 1 mở (thân không hidden), nhóm 0 đóng (thân hidden).
		const group1 = html.split('id="group-p1-1"')[1] ?? "";
		// Nhóm 1 mở ở tab Hướng dẫn của thẻ nhóm.
		const introTab =
			group1
				.split('id="group-p1-1-tabs-tab-intro"')[1]
				?.split("</button>")[0] ?? "";
		expect(introTab).toContain('aria-selected="true"');
		expect(group1).toContain("Hướng dẫn đề");
		// Nhóm 0 (đóng) vẫn mount ngầm với tab mặc định Câu hỏi được chọn.
		const group0 =
			html.split('id="group-p1-0"')[1]?.split('id="group-p1-1"')[0] ?? "";
		const qTab0 =
			group0
				.split('id="group-p1-0-tabs-tab-questions"')[1]
				?.split("</button>")[0] ?? "";
		expect(qTab0).toContain('aria-selected="true"');
	});

	it("addGroup → 2 nhóm; TestOutline hiện Nhóm câu 1/2 (#420 Task 4.8)", () => {
		const split = addGroup(partValueFromDto(partDto), "tfng");
		expect(split.groups).toHaveLength(2);
		const sections = buildTestOutline(
			"reading",
			[{ part: "p1", label: "Passage 1" }],
			new Map(),
			new Map([["p1", { dirty: true, value: split }]]),
		);
		const html = renderToStaticMarkup(
			<TestOutline
				sections={sections}
				active={{ part: "p1" }}
				onSelect={vi.fn()}
				collapsed={false}
				onCollapsedChange={vi.fn()}
			/>,
		);
		expect(html).toContain(">Nhóm câu 1</button>");
		expect(html).toContain(">Nhóm câu 2</button>");
	});

	it("part 2 nhóm (tfng 3 câu, note 2 câu): outline đánh số Câu 1–5", () => {
		const groupedDto: LibraryPartDto = {
			...partDto,
			questions: [
				{
					stem: "Câu 1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "Câu 2",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "Câu 3",
					opts: null,
					answer: "Not Given",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "Câu 4",
					opts: null,
					answer: "x",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "Câu 5",
					opts: null,
					answer: "y",
					alts: "",
					type: null,
					pin: null,
				},
			],
			groups: [
				{
					id: "g1",
					type: "tfng",
					instruction: "",
					startIndex: 0,
					count: 3,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
				{
					id: "g2",
					type: "note",
					instruction: "",
					startIndex: 3,
					count: 2,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
			],
		};
		const partsBySlot = new Map([["p1", groupedDto]]);
		const sections = buildTestOutline(
			"reading",
			[{ part: "p1", label: "Passage 1" }],
			partsBySlot,
			new Map(),
		);
		const html = renderToStaticMarkup(
			<TestOutline
				sections={sections}
				active={{ part: "p1", group: 1 }}
				onSelect={vi.fn()}
				collapsed={false}
				onCollapsedChange={vi.fn()}
			/>,
		);
		// Kongming F1 (spec Task 3.2 bước 5): part đang mở liệt kê câu của MỌI nhóm —
		// Câu 1…Câu 5; nhóm/câu đang chọn (nhóm 2) mới có aria-current.
		for (const n of [1, 2, 3, 4, 5]) {
			expect(html).toContain(`>Câu ${n}<`);
		}
		const marked = html.match(/aria-current="true"/g) ?? [];
		// part button + nhóm 2 (đang chọn) = 2; câu không có cái nào trùng selection
		// ({group:1} không có question) → không thêm.
		expect(marked).toHaveLength(2);
	});

	it("nhóm answersInline: dòng «Câu có ô trống: 1/2» khi chỉ câu đầu có ô trống", () => {
		const groupedDto: LibraryPartDto = {
			...partDto,
			type: "note",
			questions: [
				{
					stem: "one ____ gap",
					opts: null,
					answer: "x",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "no gap here",
					opts: null,
					answer: "y",
					alts: "",
					type: null,
					pin: null,
				},
			],
			groups: [
				{
					id: "g1",
					type: "note",
					instruction: "<p>Điền từ</p>",
					startIndex: 0,
					count: 2,
					optionBank: [],
					answersInline: true,
					splitContent: false,
					dragDrop: false,
				},
			],
		};
		const html = renderForm({ saved: groupedDto });
		expect(html).toContain("Câu có ô trống: 1/2");
		// Bộ đếm tổng câu của part hiện khi có nhóm.
		expect(html).toContain("Tổng số câu của part: 2/40");
		expect(html).toContain("Thêm nhóm câu");
	});
});

describe("focusKeyOf / firstIssueFocusPlan / view-state remap (helper thuần)", () => {
	it("focusKeyOf: null → rỗng; nonce khác → key khác (consume-once + re-fire)", () => {
		expect(focusKeyOf(null)).toBe("");
		const a = focusKeyOf({ group: 1, question: 2, nonce: 3 });
		expect(a).toBe("1:2:3");
		// Cùng target bấm lại (nonce mới) vẫn là key mới.
		expect(focusKeyOf({ group: 1, question: 2, nonce: 4 })).not.toBe(a);
		// Remount với prop đã reset → rỗng, không re-fire.
		expect(focusKeyOf(null)).toBe("");
	});

	it("firstIssueFocusPlan: lỗi nhóm → mở đúng nhóm + tab; lỗi field nội dung → tab Nội dung", () => {
		const flat = partValueFromDto(partDto);
		expect(firstIssueFocusPlan({ questions: "lỗi" }, flat)).toEqual({
			partTab: "questions",
		});
		expect(firstIssueFocusPlan({ passage: "lỗi" }, flat)).toEqual({
			partTab: "content",
			fieldKey: "passage",
		});
		const grouped = addGroup(partValueFromDto(partDto), "tfng");
		expect(
			firstIssueFocusPlan({ "groups.1.optionBank": "lỗi" }, grouped),
		).toEqual({ partTab: "questions", group: 1, groupTab: "questions" });
		expect(firstIssueFocusPlan({ "groups.0.type": "lỗi" }, grouped)).toEqual({
			partTab: "questions",
			group: 0,
			groupTab: "settings",
		});
	});

	it("firstIssueFocusPlan: câu thiếu đáp án trong nhóm 1 → hàng tương ứng", () => {
		const value: ReturnType<typeof partValueFromDto> = {
			...partValueFromDto(partDto),
			questions: [
				{
					stem: "đủ",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "đủ 2",
					opts: null,
					answer: "False",
					alts: "",
					type: null,
					pin: null,
				},
				{
					stem: "thiếu đáp án",
					opts: null,
					answer: "",
					alts: "",
					type: null,
					pin: null,
				},
			],
			groups: [
				{
					id: "g1",
					type: "tfng",
					instruction: "",
					startIndex: 0,
					count: 2,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
				{
					id: "g2",
					type: "tfng",
					instruction: "",
					startIndex: 2,
					count: 1,
					optionBank: [],
					answersInline: false,
					splitContent: false,
					dragDrop: false,
				},
			],
		};
		expect(firstIssueFocusPlan({ questions: "lỗi" }, value)).toEqual({
			partTab: "questions",
			group: 1,
			groupTab: "questions",
			row: 0,
		});
	});

	it("view-state dời key theo phần tử khi xóa/hoán đổi nhóm; openRow đi theo câu", () => {
		const view = {
			partTab: "questions" as const,
			openGroup: 2,
			groupTabs: { 0: "intro" as const, 2: "settings" as const },
			openRowByGroup: { 0: 1, 2: 0 },
		};
		// Xóa nhóm 1 → key 2 dời xuống 1; openGroup theo phần tử.
		const afterRemove = viewStateOnRemoveGroup(view, 1, 2);
		expect(afterRemove.openRowByGroup).toEqual({ 0: 1, 1: 0 });
		expect(afterRemove.groupTabs).toEqual({ 0: "intro", 1: "settings" });
		expect(afterRemove.openGroup).toBe(1);
		// Hoán đổi nhóm 0 ↔ 1 → cặp key đi theo nhóm được swap.
		const afterMove = viewStateOnMoveGroup(afterRemove, 0, 1);
		expect(afterMove.openRowByGroup).toEqual({ 0: 0, 1: 1 });
		expect(afterMove.openGroup).toBe(0);
	});

	it("RF-F2: xóa nhóm cuối → openGroup null (không -1)", () => {
		const view = {
			partTab: "questions" as const,
			openGroup: 0,
			groupTabs: { 0: "intro" as const },
			openRowByGroup: { 0: 1 },
		};
		const after = viewStateOnRemoveGroup(view, 0, 0);
		expect(after.openGroup).toBeNull();
		expect(after.openRowByGroup).toEqual({});
	});

	it("RS-F2: lỗi superRefine answerSet hiển thị đúng message (không bị đè bởi FIELD_ERROR_TEXT)", () => {
		// Part phẳng 2 câu cùng answerSet "s", xóa 1 câu → chỉ còn 1 câu trong
		// khóa → superRefine chặn với message "answer set needs at least two
		// questions", path ["questions",0] — trước fix bị hiển thị thành
		// "Tối đa 40 câu hỏi.".
		const value: ReturnType<typeof partValueFromDto> = {
			...partValueFromDto(partDto),
			questions: [
				{
					stem: "q1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
					answerSet: "s",
				},
			],
		};
		const result = partInputFromValue("p1", value);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			const questionError = result.errors.questions ?? "";
			expect(questionError).toContain("ít nhất hai câu");
			expect(questionError).not.toContain("40 câu");
		}
	});

	it("kongming F2: focusRowId — part phẳng dùng id hàng `${slot}-q${n}`, part có nhóm dùng prefix group-", () => {
		// Part phẳng: AnswerKeyGrid nhận partId={slot} → id hàng `${slot}-q${n}`.
		expect(focusRowId("p1", 0, 3, true)).toBe("p1-q3");
		// RF-F6: nhóm ngầm flat cuộn tới hàng đầu tiên (id `${slot}-q0`).
		expect(focusRowId("s2", 0, undefined, true)).toBe("s2-q0");
		// Part có nhóm: wrapper GroupCard + hàng theo rowIdPrefix group-…
		expect(focusRowId("p1", 1, 2, false)).toBe("group-p1-1-q2");
		expect(focusRowId("p1", 2, undefined, false)).toBe("group-p1-2");
	});
});
