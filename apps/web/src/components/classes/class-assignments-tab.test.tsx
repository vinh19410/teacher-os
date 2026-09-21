import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
	AssignmentPrompt,
	ClassAssignment,
	ClassGroup,
	Student,
} from "@/lib/mock-data";

const testClass: ClassGroup = {
	id: "cl-1",
	name: "IELTS 7.0 Tối",
	type: "ielts",
	level: "Band 7.0",
	skills: ["Writing", "Speaking"],
	mode: "Online",
	syllabusId: "",
	schedule: "T2, T4 19:00",
	sessionsTotal: 20,
	sessionsDone: 5,
	status: "active",
	startDate: "2026-09-01",
	tuitionFee: null,
	notes: "",
	studentIds: ["st-1", "st-2"],
};

const testStudents: Student[] = [
	{
		id: "st-1",
		name: "Nguyễn Văn A",
		phone: "0901234567",
		zalo: "0901234567",
		parent: { name: "", phone: "" },
		targetBand: "6.5",
		skills: [],
		examDate: "",
		tags: [],
		notes: "",
		atRisk: false,
		avatar: "NA",
		pkg: {
			total: 20,
			done: 5,
			remaining: 15,
			price: 400000,
			mode: "Online",
			start: "2026-09-01",
			expiry: "",
		},
	},
	{
		id: "st-2",
		name: "Trần Thị B",
		phone: "0901234568",
		zalo: "0901234568",
		parent: { name: "", phone: "" },
		targetBand: "6.5",
		skills: [],
		examDate: "",
		tags: [],
		notes: "",
		atRisk: false,
		avatar: "TB",
		pkg: {
			total: 20,
			done: 5,
			remaining: 15,
			price: 400000,
			mode: "Online",
			start: "2026-09-01",
			expiry: "",
		},
	},
];

const testPrompts: AssignmentPrompt[] = [
	{
		id: "p-ready",
		skill: "writing",
		part: "task2",
		type: "opinion",
		task: "task2",
		genre: "opinion",
		title: "Writing Task 2 — Opinion",
		band: "7.0",
		source: "Cambridge 15",
		prompt: "Some people believe...",
		questions: [],
		note: "",
		status: "ready",
		createdAt: "2026-09-18T10:00:00.000Z",
	},
	{
		id: "p-draft",
		skill: "writing",
		part: "task1",
		type: "chart",
		task: "task1",
		genre: "chart",
		title: "Writing Task 1 — Draft",
		band: "6.5",
		source: "",
		prompt: "The chart shows...",
		questions: [],
		note: "",
		status: "draft",
		createdAt: "2026-09-18T09:00:00.000Z",
	},
];

const testAssignments: ClassAssignment[] = [
	{
		id: "ca-done",
		classId: "cl-1",
		promptId: "p-ready",
		title: "Writing Task 2 — Opinion",
		due: "2026-09-15",
		note: "",
		createdAt: "2026-09-10T10:00:00.000Z",
		targets: [
			{ studentId: "st-1", submittedAt: "2026-09-14T10:00:00.000Z" },
			{ studentId: "st-2", submittedAt: "2026-09-15T09:00:00.000Z" },
		],
	},
	{
		id: "ca-overdue",
		classId: "cl-1",
		promptId: "p-other",
		title: "Writing Task 1 — Process",
		due: "2026-09-12",
		note: "",
		createdAt: "2026-09-08T10:00:00.000Z",
		targets: [
			{ studentId: "st-1", submittedAt: null },
			{ studentId: "st-2", submittedAt: null },
		],
	},
	{
		id: "ca-open",
		classId: "cl-1",
		promptId: "p-future",
		title: "Writing Task 2 — Discuss",
		due: "2030-01-01",
		note: "",
		createdAt: "2026-09-18T10:00:00.000Z",
		targets: [
			{ studentId: "st-1", submittedAt: null },
			{ studentId: "st-2", submittedAt: null },
		],
	},
];

let currentDataFixture = {
	classAssignments: testAssignments,
	assignmentPrompts: testPrompts,
	students: testStudents,
};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: currentDataFixture,
		studentById: (id: string) => testStudents.find((s) => s.id === id),
	}),
}));

const mockSubmit = {
	saving: false,
	error: undefined,
	notice: undefined,
	submitBlocked: false,
	run: vi.fn(),
	reconcile: vi.fn(),
	reset: vi.fn(),
};

vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => mockSubmit,
}));

import { ClassAssignmentsTab } from "./class-assignments-tab";

describe("ClassAssignmentsTab (#208)", () => {
	it("renders view list with cards and rollup tags (Đã nộp hết, Quá hạn, Đang mở)", () => {
		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				view="list"
				onViewChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Bài đã giao lớp này");
		expect(html).toContain("Giao thêm đề");

		// Items rendered
		expect(html).toContain("Writing Task 2 — Opinion");
		expect(html).toContain("Writing Task 1 — Process");
		expect(html).toContain("Writing Task 2 — Discuss");

		// Rollup tags
		expect(html).toContain("Đã nộp hết");
		expect(html).toContain("Quá hạn");
		expect(html).toContain("Đang mở");

		// Summary count
		expect(html).toContain("2/6 đã nộp");
	});

	it("renders view assign with picker, student list, and action bar", () => {
		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				view="assign"
				onViewChange={vi.fn()}
			/>,
		);

		// Picker
		expect(html).toContain("Đề sẵn sàng");
		expect(html).toContain("Writing Task 2 — Opinion");
		// Draft prompt is hidden from picker
		expect(html).not.toContain("Writing Task 1 — Draft");

		// Form targets
		expect(html).toContain("Giao cho lớp này");
		expect(html).toContain("Hạn nộp và học viên");
		expect(html).toContain("Nguyễn Văn A");
		expect(html).toContain("Trần Thị B");

		// Action bar copy initial (no prompt selected)
		expect(html).toContain("Chưa chọn đề");
		expect(html).toContain("Giao bài tập");
	});

	it("renders empty state when class has no assignments", () => {
		currentDataFixture = {
			classAssignments: [],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};

		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				view="list"
				onViewChange={vi.fn()}
			/>,
		);

		expect(html).toContain("Chưa giao bài nào cho lớp này.");
		expect(html).toContain("Chưa giao bài");
	});
});
