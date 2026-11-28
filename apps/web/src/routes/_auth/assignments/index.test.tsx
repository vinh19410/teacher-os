import type { KernelViewer } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
	AssignmentPrompt,
	ClassAssignment,
	ClassGroup,
} from "@/lib/mock-data";

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockRefresh = vi.fn();
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
		level: "Intermediate",
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
		level: "Upper-Int",
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

const classesFixture: ClassGroup[] = [
	{
		id: "cl-1",
		name: "IELTS Foundation 5.5",
		level: "5.5",
		type: "ielts",
		skills: ["Writing", "Reading"],
		mode: "Online",
		syllabusId: "",
		studentIds: ["st-1", "st-2"],
		invitedStudentIds: [],
		schedule: "T3 & T5",
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: "2026-09-01",
		tuitionFee: null,
		notes: "",
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
		targets: [
			{ studentId: "st-1", submittedAt: "2026-09-20T10:00:00.000Z" },
			{ studentId: "st-2", submittedAt: null },
		],
	},
];

let mockStoreData: {
	assignmentPrompts: AssignmentPrompt[];
	classAssignments: ClassAssignment[];
	classes: ClassGroup[];
	viewer: KernelViewer;
} = {
	assignmentPrompts: bankFixture,
	classAssignments: classAssignmentsFixture,
	classes: classesFixture,
	viewer: { role: "teacher", canAccessFinance: true },
};

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: mockStoreData,
		dispatch: mockDispatch,
		refresh: mockRefresh,
	}),
}));

import { AssignmentsRoute } from "./index";

describe("AssignmentsRoute — redesign theo open-design/assignments.html", () => {
	it("renders page head, 4 KPI tiles, toolbar, and split list", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Bài tập");
		expect(html).toContain(
			"Ngân hàng đề của bạn. Lọc, xem trước như học viên thấy, rồi giao thẳng cho lớp.",
		);
		expect(html).toContain("Bộ đề tự học");
		expect(html).toContain("Tạo bài tập");
		expect(html).toContain("Đề trong ngân hàng");
		expect(html).toContain("Đang giao cho lớp");
		expect(html).toContain("Sẵn sàng, chưa giao");
		expect(html).toContain("Tìm theo tên đề, dạng đề hoặc nguồn");
		expect(html).toContain("Phần thi");
		expect(html).toContain("Trạng thái");
		expect(html).toContain("Sắp xếp");
		expect(html).toContain("Hiện");
		expect(html).toContain("/ 4 đề");
	});

	it("renders rows with status badges: 'Đã giao N lớp', 'Sẵn sàng', and 'Bản nháp'", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Bản nháp");
		expect(html).toContain("Đã giao 1 lớp");
		expect(html).toContain("Sẵn sàng");
	});

	it("renders preview panel tabs without exposing secret answer key", () => {
		mockStoreData = {
			assignmentPrompts: [bankFixture[3]],
			classAssignments: [],
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Đề phía học viên");
		expect(html).toContain("Lịch sử giao");
		expect(html).toContain("Question stem one");
		expect(html).not.toContain("SECRET_ANSWER_FALSE");
		expect(html).toContain("Chấm tự động");
		expect(html).toContain("Giao cho lớp");
		expect(html).toContain("Xem trước");
		expect(html).toContain("Sửa");
		expect(html).toContain("Nhân bản");
	});

	it("renders diagram thumbnail in preview panel without answer key (#269)", () => {
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
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain('alt="Ảnh biểu đồ đề Reading"');
		expect(html).toContain("https://example.com/qc-269-bank.png");
		expect(html).not.toContain("SECRET_ANSWER_THUMB");
	});

	it("does not render thumbnail for non-diagram prompts (#269)", () => {
		mockStoreData = {
			assignmentPrompts: [bankFixture[3]],
			classAssignments: [],
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);
		expect(html).not.toContain("<img");
	});

	it("renders empty bank state when there are zero prompts", () => {
		mockStoreData = {
			assignmentPrompts: [],
			classAssignments: [],
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain("Ngân hàng đề đang trống");
		expect(html).toContain("Tạo bài tập đầu tiên");
	});

	it("renders skill tabs with aria-hidden counts and optgroups in part select", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);

		expect(html).toContain('aria-label="Kỹ năng"');
		expect(html).toContain("Writing");
		expect(html).toContain("Reading");
		expect(html).toContain("Listening");
		expect(html).toContain("Speaking");
		expect(html).toContain("<optgroup");
		expect(html).toContain('aria-hidden="true"');
	});

	it("filters by URL search param (?skill=reading)", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		mockSearch.current = { skill: "reading" };
		try {
			const html = renderToStaticMarkup(<AssignmentsRoute />);
			expect(html).toContain(">1</strong> / 4 đề");
		} finally {
			mockSearch.current = {};
		}
	});

	it("hides assign and delete draft actions when viewer role is ta", () => {
		mockStoreData = {
			assignmentPrompts: bankFixture,
			classAssignments: classAssignmentsFixture,
			classes: classesFixture,
			viewer: { role: "ta", canAccessFinance: false },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);
		expect(html).not.toContain("Xóa nháp");
		expect(html).not.toContain(">Giao cho lớp<");
	});

	it("renders 'Chưa chọn dạng' for draft prompts without a type (#577)", () => {
		mockStoreData = {
			assignmentPrompts: [
				{
					id: "ap-no-type",
					skill: "writing",
					part: "task2",
					type: "",
					task: "task2",
					genre: "",
					title: "Writing Draft Chưa Chọn Dạng",
					band: "7.0",
					source: "",
					prompt: "Essay prompt",
					questions: [],
					note: "",
					status: "draft",
					createdAt: "2026-09-18T12:00:00.000Z",
				},
			],
			classAssignments: [],
			classes: classesFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		const html = renderToStaticMarkup(<AssignmentsRoute />);
		expect(html).toContain("Chưa chọn dạng");
		expect(html).toContain("Xóa nháp");
		expect(html).toContain("Xem trước");
	});
});
