import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SyllabusTemplate } from "@/lib/mock-data";
import { TemplatePicker } from "./template-picker";

const templates: SyllabusTemplate[] = [
	{
		id: "tpl-a",
		name: "IELTS Foundation",
		level: "Band 5.0",
		type: "ielts",
		classId: null,
		sourceTemplateId: null,
		skills: ["Writing", "Speaking"],
		totalLessons: 3,
		description: "",
		modules: [
			{
				id: "m-a1",
				title: "Module A",
				description: undefined,
				lessons: [
					{
						id: "l-a1",
						title: "Buổi mở đầu",
						objectives: "—",
						materials: "—",
						kind: "lesson",
						status: "upcoming",
					},
					{
						id: "l-a2",
						title: "Thi thử giữa kỳ",
						objectives: "—",
						materials: "—",
						kind: "midterm",
						status: "upcoming",
					},
				],
			},
			{
				id: "m-a2",
				title: "Module B",
				description: undefined,
				lessons: [],
			},
		],
	},
	{
		id: "tpl-b",
		name: "Giao tiếp A1",
		level: "",
		type: "communication",
		classId: null,
		sourceTemplateId: null,
		skills: [],
		totalLessons: 0,
		description: "",
		modules: [],
	},
];

function render(props: Partial<Parameters<typeof TemplatePicker>[0]> = {}) {
	return renderToStaticMarkup(
		<TemplatePicker
			templates={templates}
			value="tpl-a"
			onChange={() => undefined}
			{...props}
		/>,
	);
}

describe("TemplatePicker", () => {
	it("(a) danh sách rỗng: hiện thông báo và không render select", () => {
		const html = render({ templates: [] });
		expect(html).toContain(
			"Chưa có template nào — tạo syllabus ở trang Syllabus trước.",
		);
		expect(html).not.toContain("<select");
	});

	it("(a2) allowEmpty với danh sách rỗng: vẫn có select chỉ chứa option trống", () => {
		const html = render({ templates: [], allowEmpty: true });
		expect(html).toContain("<select");
		expect(html).toContain("— Lớp trống —");
		expect(html).not.toContain("<details");
	});

	it("(b) allowEmpty: có option rỗng; value rỗng thì không có preview", () => {
		const html = render({ allowEmpty: true, value: "" });
		expect(html).toContain("— Lớp trống —");
		expect(html).not.toContain("<details");
		expect(html).not.toContain("Writing");
	});

	it("(c) chọn template: hiện số buổi và đúng danh sách kỹ năng", () => {
		const html = render({ value: "tpl-a" });
		expect(html).toContain("IELTS Foundation · 3 buổi");
		expect(html).toContain("3 buổi");
		expect(html).toContain("Writing");
		expect(html).toContain("Speaking");
	});

	it("(d) preview liệt kê module, lesson và badge buổi thi", () => {
		const html = render({ value: "tpl-a" });
		expect(html).toContain("Xem nội dung");
		expect(html).toContain("Module A");
		expect(html).toContain("Module B");
		expect(html).toContain("Buổi mở đầu");
		expect(html).toContain("Thi thử giữa kỳ");
		expect(html).toContain("Thi giữa kỳ");
	});

	it("(e) template không có kỹ năng: nhánh chưa khai báo kỹ năng", () => {
		const html = render({ value: "tpl-b" });
		expect(html).toContain("Syllabus chưa khai báo kỹ năng");
	});

	it("(f) value không còn trong danh sách: không crash, không preview", () => {
		const html = render({ value: "tpl-mất-tích" });
		expect(html).toContain("<select");
		expect(html).not.toContain("Xem nội dung");
		expect(html).toContain("IELTS Foundation · 3 buổi");
	});
});
