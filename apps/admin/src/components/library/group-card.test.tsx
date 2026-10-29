import type { QuestionItem } from "@teacher-os/ui/components/assignments/editor/assignment-presets";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GroupCard } from "./group-card";

const group = {
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

const items: QuestionItem[] = [
	{ stem: "q1", opts: null, answer: "True", alts: "", type: null, pin: null },
	{ stem: "q2", opts: null, answer: "False", alts: "", type: null, pin: null },
];

function renderCard(errorFor: (field: string) => string | undefined): string {
	return renderToStaticMarkup(
		<GroupCard
			skill="reading"
			slot="p1"
			index={0}
			group={group}
			items={items}
			qStart={1}
			open
			onToggle={vi.fn()}
			activeTab="questions"
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
});
