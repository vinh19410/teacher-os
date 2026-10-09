import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AssignmentPrompt, ClassAssignment } from "@/lib/mock-data";

const mockNavigate = vi.fn();
/** URL search params (?skill=&part=&q=) the route reads its filters from. */
const mockSearch = vi.hoisted(() => ({
	current: {} as Record<string, string>,
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => mockNavigate,
	useSearch: () => mockSearch.current,
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

const bankFixture: AssignmentPrompt[] = [
	{
		id: "ap-draft",
		skill: "writing",
		part: "task1",
		type: "chart",
		task: "task1",
		genre: "chart",
		title: "Writing Task 1 — Chart Draft",
		band: "6.5",
		source: "Cambridge 10",
		prompt: "The chart below shows...",
		questions: [],
		note: "",
		status: "draft",
		createdAt: "2026-09-18T12:00:00.000Z",
	},
	{
		id: "ap-used",
		skill: "writing",
		part: "task2",
		type: "discuss",
		task: "task2",
		genre: "discuss",
		title: "Writing Task 2 — Discuss Both Views",
		band: "7.0",
		source: "Cambridge 12",
		prompt: "Some people think that...",
		questions: [],
		note: "",
		status: "ready",
		createdAt: "2026-09-17T10:00:00.000Z",
	},
	{
		id: "ap-ready",
		skill: "writing",
		part: "task2",
		type: "opinion",
		task: "task2",
		genre: "opinion",
		title: "Writing Task 2 — Opinion Essay",
		band: "7.5",
		source: "Cambridge 14",
		prompt: "Do you agree or disagree...",
		questions: [],
		note: "",
		status: "ready",
		createdAt: "2026-09-16T08:00:00.000Z",
	},
	{
		id: "ap-reading",
		skill: "reading",
		part: "p1",
		type: "tfng",
		task: "task2",
		genre: "discuss",
		title: "Reading Passage 1 — TFNG",
		band: "7.0",
		source: "Cambridge 10",
		prompt: "",
		passage: "Stepwells are underground reservoirs...",
		intro: "Questions 1-2",
		questions: [
			{
				stem: "Question stem one",
				opts: null,
				answer: "SECRET_ANSWER_FALSE",
				alts: "",
			},
		],
		note: "",
		status: "ready",
		createdAt: "2026-09-15T08:00:00.000Z",
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

let mockStoreData: {
	assignmentPrompts: AssignmentPrompt[];
	classAssignments: ClassAssignment[];
} = {
	assignmentPrompts: bankFixture,
	classAssignments: classAssignmentsFixture,
};

vi.mock("@/lib/data-store", () => ({
	useData: () => ({ data: mockStoreData }),
}));

import { AssignmentsRoute } from "./index";

describe("AssignmentsRoute — merged created-assignments page (#267)", () => {
	it("renders page structure and copy per design", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Bài tập");
		expect(html).toContain(
			"Danh sách bài tập đã tạo. Lọc theo kỹ năng rồi giao cho lớp ở trang Lớp học.",
		);
		expect(html).toContain("+ Tạo bài tập");
		expect(html).toContain("Kỹ năng");
		expect(html).toContain("Phần thi");
		expect(html).toContain("Tìm đề theo tiêu đề hoặc nguồn");
		expect(html).toContain("Đang hiện");
		expect(html).toContain("/ 4 đề");
	});

	it("renders rows with usage-status tags: used class wins over ready, draft shows draft", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Bản nháp");
		expect(html).toContain("Đã dùng 1 lớp");
		expect(html).toContain("Sẵn sàng");
	});

	it("renders preview aside with student view kicker without exposing answer key", () => {
		mockStoreData = {
			assignmentPrompts: [bankFixture[3]], // reading with secret answer
			classAssignments: [],
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Xem trước phía học viên");
		expect(html).toContain("Đề này chưa giao lớp. Giao cho học viên ở trang");
		expect(html).toContain("Lớp học");
		expect(html).toContain("Question stem one");
		expect(html).not.toContain("SECRET_ANSWER_FALSE");
		expect(html).toContain("Chấm tự động");
	});

	it("renders the diagram thumbnail in the bank preview aside (#269)", () => {
		mockStoreData = {
			assignmentPrompts: [
				{
					...bankFixture[3],
					id: "ap-diagram",
					part: "p1",
					type: "diagram",
					title: "Reading Diagram — bank",
					imageUrl: "https://example.com/qc-269-bank.png",
					questions: [
						{
							stem: "Label 4.",
							opts: null,
							answer: "SECRET_ANSWER_THUMB",
							alts: "",
						},
					],
				},
			],
			classAssignments: [],
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain('alt="Ảnh biểu đồ đề Reading"');
		expect(html).toContain("https://example.com/qc-269-bank.png");
		expect(html).not.toContain("SECRET_ANSWER_THUMB");
	});

	it("does not render the aside thumbnail for non-diagram prompts (#269)", () => {
		mockStoreData = {
			assignmentPrompts: [bankFixture[3]], // tfng, no image
			classAssignments: [],
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);
		expect(html).not.toContain("<img");
	});

	it("renders empty state when there are zero prompts", () => {
		mockStoreData = {
			assignmentPrompts: [],
			classAssignments: [],
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Chưa có bài tập nào");
		expect(html).toContain(
			"Tạo bài tập đầu tiên để lưu vào danh sách và giao cho các lớp học.",
		);
		expect(html).toContain("Tạo bài tập đầu tiên");
	});

	it("renders filter UI: search, skill chips, part chips grouped by skill with counts", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Tìm đề theo tiêu đề hoặc nguồn");
		expect(html).toContain("Kỹ năng");
		expect(html).toContain("Listening");
		expect(html).toContain("Speaking");
		expect(html).toContain("Tất cả phần");
		// Skill="Tất cả" → 4 nhóm part dán nhãn kỹ năng thay vì tường 12 chip trộn.
		expect(html).toContain('aria-label="Phần thi Writing"');
		expect(html).toContain('aria-label="Phần thi Reading"');
		expect(html).toContain('aria-label="Phần thi Listening"');
		expect(html).toContain('aria-label="Phần thi Speaking"');
		expect(html).toContain('aria-label="Kỹ năng"');
		// Fixture: 3 Writing + 1 Reading → badge đếm trên chip, 0 cho skill rỗng.
		expect(html).toContain(">3</span>");
		expect(html).toContain(">1</span>");
		expect(html).toContain(">0</span>");
		// Badge đếm ẩn với AT để accessible name chip giữ nguyên cho e2e.
		expect(html).toContain('aria-hidden="true"');
	});

	it("counts prompts from the live bank, not a fixed number", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const total = bankFixture.length;
		expect(renderToStaticMarkup(<AssignmentsRoute />)).toContain(
			`${total}/${total} đề`,
		);
		// Fixture: 3 Writing + 1 Reading — a skill filter in the URL narrows it.
		mockSearch.current = { skill: "reading" };
		try {
			expect(renderToStaticMarkup(<AssignmentsRoute />)).toContain(
				`1/${total} đề`,
			);
		} finally {
			mockSearch.current = {};
		}
	});

	it("renders the mobile filter toggle with aria wiring", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Bộ lọc");
		expect(html).toContain('aria-controls="assignment-filters-body"');
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('id="assignment-filters-body"');
	});

	it("pins the create CTA to the dedicated prompt page (#202)", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);
		expect(html).toContain("+ Tạo bài tập");
	});
});
