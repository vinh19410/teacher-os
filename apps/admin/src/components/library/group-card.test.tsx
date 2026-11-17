// @vitest-environment jsdom
import { quizTypeDisplay } from "@teacher-os/api/contracts";
import {
	LIBRARY_READING_TYPES,
	type LibraryQuestionGroup,
} from "@teacher-os/api/library-contracts";
import type { QuestionItem } from "@teacher-os/ui/components/assignments/editor/assignment-presets";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GroupCard, type GroupCardTab } from "./group-card";

const baseGroup: LibraryQuestionGroup = {
	id: "g1",
	type: "tfng",
	instruction: "",
	startIndex: 0,
	count: 2,
	optionBank: [],
	answersInline: false,
	splitContent: false,
	dragDrop: false,
};

const baseItems: QuestionItem[] = [
	{ stem: "q1", opts: null, answer: "True", alts: "", type: null, pin: null },
	{ stem: "q2", opts: null, answer: "False", alts: "", type: null, pin: null },
];

function renderCard(
	errorFor: (field: string) => string | undefined,
	overrides: {
		group?: Partial<LibraryQuestionGroup>;
		items?: QuestionItem[];
		activeTab?: GroupCardTab;
	} = {},
): string {
	return renderToStaticMarkup(
		<GroupCard
			skill="reading"
			slot="p1"
			index={0}
			group={{ ...baseGroup, ...overrides.group }}
			items={overrides.items ?? baseItems}
			qStart={1}
			open
			onToggle={vi.fn()}
			activeTab={overrides.activeTab ?? "questions"}
			onTabChange={vi.fn()}
			openRow={null}
			onOpenRowChange={vi.fn()}
			rowIdPrefix="group-p1-0"
			onPatch={vi.fn()}
			onItemsChange={vi.fn()}
			onMove={vi.fn()}
			onRemove={vi.fn()}
			canMoveUp
			canMoveDown
			imageUrl=""
			onImageUrlChange={vi.fn()}
			showErrors
			status="draft"
			errorFor={errorFor}
		/>,
	);
}

describe("GroupCard (render tĩnh)", () => {
	it("#426 F2: lỗi cấp nhóm (key `groups.0` không field) hiện banner đúng thẻ", () => {
		const html = renderCard((field) =>
			field === "groups.0"
				? "Các câu cùng khóa tập đáp án phải nằm trong một nhóm."
				: undefined,
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain("phải nằm trong một nhóm");
		// Banner text xuất hiện ĐÚNG 1 lần (không nhân bản ở tab/panel khác).
		expect(html.split("phải nằm trong một nhóm").length - 1).toBe(1);
	});

	it("không có lỗi cấp nhóm → không render banner", () => {
		const html = renderCard(() => undefined);
		expect(html).not.toContain("phải nằm trong một nhóm");
	});

	it("dropdown nhóm hiển thị 15 dạng reading với nhãn thân thiện", () => {
		const html = renderCard(() => undefined, { activeTab: "settings" });
		const dom = document.createElement("div");
		dom.innerHTML = html;
		const typeSelect = dom.querySelector("#group-p1-0-type");
		expect(typeSelect).not.toBeNull();
		const optionValues = [
			...(typeSelect?.querySelectorAll("option") ?? []),
		].map((opt) => ({
			value: opt.getAttribute("value"),
			label: opt.textContent,
		}));
		expect(optionValues).toEqual(
			LIBRARY_READING_TYPES.map((type) => ({
				value: type,
				label: quizTypeDisplay(type).label,
			})),
		);
		expect(optionValues.some((o) => o.value === "note")).toBe(false);
	});

	it("bật checkbox answersInline cho fill_blank và diagram; khóa với tfng", () => {
		const checkDisabled = (type: string) => {
			const html = renderCard(() => undefined, {
				group: { type },
				activeTab: "settings",
			});
			const dom = document.createElement("div");
			dom.innerHTML = html;
			const label = [...dom.querySelectorAll("label")].find((el) =>
				el.textContent?.includes("Ô trả lời nằm trong hướng dẫn"),
			);
			const checkbox = label?.querySelector('input[type="checkbox"]');
			expect(checkbox).not.toBeNull();
			return checkbox?.hasAttribute("disabled") ?? false;
		};

		expect(checkDisabled("fill_blank")).toBe(false);
		expect(checkDisabled("diagram")).toBe(false);
		expect(checkDisabled("tfng")).toBe(true);
	});

	it("truyền libraryReadingMode cho QuestionKeyEditor (summary Word Bank/Cloze/Table, mcq_many)", () => {
		const summaryHtml = renderCard(() => undefined, {
			group: { type: "summary", optionBank: ["A", "B"] },
		});
		expect(summaryHtml).toContain("Dùng ngân hàng từ (Word Bank)");
		expect(summaryHtml).toContain("Ngân hàng từ (Word Bank)");
		expect(summaryHtml).toContain("Đoạn văn (Cloze)");
		expect(summaryHtml).toContain("Bảng (Grid)");

		const mcqManyHtml = renderCard(() => undefined, {
			group: { type: "mcq_many" },
			items: [
				{
					stem: "Choose TWO",
					opts: ["One", "Two", "Three"],
					answer: "A",
					alts: "",
					type: null,
					pin: null,
					answerSet: "s1",
				},
				{
					stem: "Choose TWO",
					opts: ["One", "Two", "Three"],
					answer: "B",
					alts: "",
					type: null,
					pin: null,
					answerSet: "s1",
				},
			],
		});
		expect(mcqManyHtml).toContain("Soạn câu hỏi chọn nhiều đáp án");
	});

	it("lỗi imageUrl chỉ gắn chấm lỗi tab Câu hỏi cho nhóm image-based (diagram), không gắn cho tfng", () => {
		const hasQuestionsTabError = (type: string) => {
			const html = renderCard(
				(field) =>
					field === "imageUrl" ? "Ảnh phải là URL https hợp lệ." : undefined,
				{ group: { type }, activeTab: "settings" },
			);
			const dom = document.createElement("div");
			dom.innerHTML = html;
			const qTab = dom.querySelector("#group-p1-0-tabs-tab-questions");
			return qTab?.textContent?.includes("có lỗi") ?? false;
		};

		expect(hasQuestionsTabError("tfng")).toBe(false);
		expect(hasQuestionsTabError("diagram")).toBe(true);
	});
});
