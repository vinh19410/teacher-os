import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AssignmentPrompt, ClassAssignment } from "@/lib/mock-data";

const bankFixture: AssignmentPrompt[] = [
	{
		id: "ap-draft",
		task: "task1",
		genre: "chart",
		title: "Writing Task 1 — Chart Draft",
		band: "6.5",
		source: "Cambridge 10",
		prompt: "The chart below shows...",
		note: "",
		status: "draft",
		createdAt: "2026-09-18T12:00:00.000Z",
	},
	{
		id: "ap-used",
		task: "task2",
		genre: "discuss",
		title: "Writing Task 2 — Discuss Both Views",
		band: "7.0",
		source: "Cambridge 12",
		prompt: "Some people think that...",
		note: "",
		status: "ready",
		createdAt: "2026-09-17T10:00:00.000Z",
	},
	{
		id: "ap-ready",
		task: "task2",
		genre: "opinion",
		title: "Writing Task 2 — Opinion Essay",
		band: "7.5",
		source: "Cambridge 14",
		prompt: "Do you agree or disagree...",
		note: "",
		status: "ready",
		createdAt: "2026-09-16T08:00:00.000Z",
	},
];

const classAssignmentsFixture: ClassAssignment[] = [
	{
		id: "ca-1",
		classId: "cl-1",
		promptId: "ap-used",
		title: "Writing Task 2 — Discuss Both Views",
		due: "2026-09-25",
		note: "",
		createdAt: "2026-09-17T11:00:00.000Z",
		targets: [{ studentId: "st-1", submittedAt: null }],
	},
];

let currentDataFixture = {
	assignmentPrompts: bankFixture,
	classAssignments: classAssignmentsFixture,
};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => ({ data: currentDataFixture }),
}));

import { AssignmentBankPage } from "./bank";

describe("AssignmentBankPage (#208)", () => {
	it("renders bank list page structure and copy per design", () => {
		currentDataFixture = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentBankPage />);

		expect(html).toContain("Ngân hàng bài tập");
		expect(html).toContain(
			"Đề đã lưu sau khi soạn. Lọc theo dạng bài rồi giao cho lớp ở trang Lớp học.",
		);
		expect(html).toContain("Tạo đề mới");
		expect(html).toContain("Dạng bài");
		expect(html).toContain("Dạng đề");
		expect(html).toContain("Tìm đề theo tiêu đề hoặc nguồn");
		expect(html).toContain("Đang hiện");
		expect(html).toContain("3");
		expect(html).toContain("/ 3 đề");
	});

	it("renders rows with status tags priority: draft > used > ready", () => {
		currentDataFixture = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentBankPage />);

		// Draft prompt gets "Bản nháp" tag
		expect(html).toContain("Bản nháp");
		// Used prompt gets "Đã dùng 1 lớp" tag
		expect(html).toContain("Đã dùng 1 lớp");
		// Unused ready prompt gets "Sẵn sàng" tag
		expect(html).toContain("Sẵn sàng");
	});

	it("renders preview aside with student view kicker and static copy", () => {
		currentDataFixture = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentBankPage />);

		expect(html).toContain("Xem trước phía học viên");
		expect(html).toContain("Đề này chưa giao lớp. Giao cho học viên ở trang");
		expect(html).toContain("Lớp học");
	});

	it("renders empty state when bank has zero prompts", () => {
		currentDataFixture = {
			assignmentPrompts: [],
			classAssignments: [],
		};
		const html = renderToStaticMarkup(<AssignmentBankPage />);

		expect(html).toContain("Chưa có đề nào trong ngân hàng");
		expect(html).toContain(
			"Tạo đề đầu tiên để lưu vào ngân hàng và giao cho các lớp học.",
		);
	});
});
