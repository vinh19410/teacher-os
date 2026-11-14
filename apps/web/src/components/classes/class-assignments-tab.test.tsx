// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
	invitedStudentIds: [],
};

const testStudents: Student[] = [
	{
		id: "st-1",
		name: "Nguyễn Văn A",
		phone: "0901234567",
		zalo: "0901234567",
		email: "a@test.local",
		hasPackage: true,
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
		email: "b@test.local",
		hasPackage: true,
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
		id: "p-writing",
		skill: "writing",
		part: "task2",
		type: "opinion",
		task: "task2",
		genre: "opinion",
		title: "Writing Task 2 — Grade",
		band: "7.0",
		source: "",
		prompt: "Some people think...",
		questions: [],
		note: "",
		status: "ready",
		createdAt: "2026-09-18T08:00:00.000Z",
	},
	{
		id: "p-reading",
		skill: "reading",
		part: "p1",
		type: "info",
		task: "task1",
		genre: "",
		title: "Reading — True/False",
		band: "6.0",
		source: "",
		prompt: "Read the passage...",
		questions: [],
		note: "",
		status: "ready",
		createdAt: "2026-09-18T07:00:00.000Z",
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
	Link: (props: {
		to: string;
		children?: React.ReactNode;
		params?: Record<string, string>;
		search?: Record<string, string>;
		className?: string;
	}) => {
		const searchStr = props.search
			? `?${new URLSearchParams(props.search).toString()}`
			: "";
		return (
			<a
				href={`${props.to.replace("$attemptId", props.params?.attemptId ?? "")}${searchStr}`}
				className={props.className}
			>
				{props.children}
			</a>
		);
	},
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: currentDataFixture,
		studentById: (id: string) => testStudents.find((s) => s.id === id),
	}),
}));

import { ClassAssignmentsTab } from "./class-assignments-tab";

beforeAll(() => {
	if (typeof globalThis.ResizeObserver === "undefined") {
		globalThis.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
});

afterEach(() => {
	cleanup();
	currentDataFixture = {
		classAssignments: testAssignments,
		assignmentPrompts: testPrompts,
		students: testStudents,
	};
});

describe("ClassAssignmentsTab (#208, #717)", () => {
	it("hiển thị danh sách bài đã giao, nút + Giao bài tập (không còn Giao thêm đề hay token v1) và kích hoạt onOpenAssignModal", () => {
		const onOpenAssignModal = vi.fn();
		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={onOpenAssignModal}
			/>,
		);

		expect(html).toContain("Bài đã giao lớp này");
		expect(html).toContain("+ Giao bài tập");
		expect(html).not.toContain("Giao thêm đề");
		expect(html).not.toContain("border-border-soft");
		expect(html).not.toContain("ring-fg");

		expect(html).toContain("Writing Task 2 — Opinion");
		expect(html).toContain("Writing Task 1 — Process");
		expect(html).toContain("Writing Task 2 — Discuss");

		expect(html).toContain("Đã nộp hết");
		expect(html).toContain("Quá hạn");
		expect(html).toContain("Đang mở");
		expect(html).toContain("2/6 đã nộp");

		render(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={onOpenAssignModal}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "+ Giao bài tập" }));
		expect(onOpenAssignModal).toHaveBeenCalledTimes(1);
	});

	it("hiển thị empty state với nút Giao bài tập khi lớp chưa có bài nào", () => {
		currentDataFixture = {
			classAssignments: [],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};
		const onOpenAssignModal = vi.fn();

		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={onOpenAssignModal}
			/>,
		);

		expect(html).toContain("Chưa giao bài nào cho lớp này.");
		expect(html).toContain("Chưa giao bài");
		expect(html).toContain("Giao bài tập");
		expect(html).not.toContain("+ Giao bài tập");
		expect(html).not.toContain("Giao thêm đề");

		render(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={onOpenAssignModal}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Giao bài tập" }));
		expect(onOpenAssignModal).toHaveBeenCalledTimes(1);
	});

	it("shows grade links only for submitted writing/speaking targets", () => {
		const caGrade: ClassAssignment = {
			id: "ca-grade",
			classId: "cl-1",
			promptId: "p-writing",
			title: "Writing Task 2 — Grade",
			due: "2030-01-05",
			note: "",
			createdAt: "2026-09-20T10:00:00.000Z",
			targets: [
				{
					studentId: "st-1",
					submittedAt: "2026-09-20T10:00:00.000Z",
					attemptId: "att-1",
					gradedAt: null,
					band: null,
				},
				{
					studentId: "st-2",
					submittedAt: "2026-09-20T11:00:00.000Z",
					attemptId: "att-2",
					gradedAt: "2026-09-21T10:00:00.000Z",
					band: 6.5,
				},
			],
		};
		const caRead: ClassAssignment = {
			id: "ca-read",
			classId: "cl-1",
			promptId: "p-reading",
			title: "Reading — True/False",
			due: "2030-01-06",
			note: "",
			createdAt: "2026-09-20T09:00:00.000Z",
			targets: [
				{
					studentId: "st-1",
					submittedAt: "2026-09-20T12:00:00.000Z",
					attemptId: "att-3",
					gradedAt: null,
					band: null,
				},
			],
		};
		currentDataFixture = {
			classAssignments: [...testAssignments, caGrade, caRead],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};

		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
			/>,
		);

		expect(html).toContain('href="/grading/att-1"');
		expect(html).toContain("Chấm bài");
		expect(html).toContain("Đã chấm · Band 6.5");
		expect(html).toContain('href="/grading/att-2"');
		expect(html).not.toContain("/grading/att-3");
	});

	it("assignmentsFocus opens every accordion item", () => {
		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				assignmentsFocus
			/>,
		);

		const items = html.match(/class="assign-item/g)?.length ?? 0;
		const expanded = html.match(/aria-expanded="true"/g)?.length ?? 0;
		expect(items).toBeGreaterThan(0);
		expect(expanded).toBe(items);
	});

	it("tự động mở sẵn bài mới nhất đầu danh sách khi lastAssignedNonce tăng (#717)", () => {
		const caPendingOlder: ClassAssignment = {
			id: "ca-pending-older",
			classId: "cl-1",
			promptId: "p-writing",
			title: "Bài cũ đang chờ chấm",
			due: "2030-01-05",
			note: "",
			createdAt: "2026-09-20T10:00:00.000Z",
			targets: [
				{
					studentId: "st-1",
					submittedAt: "2026-09-20T10:00:00.000Z",
					attemptId: "att-old",
					gradedAt: null,
					band: null,
				},
			],
		};
		const caNewest: ClassAssignment = {
			id: "ca-newest",
			classId: "cl-1",
			promptId: "p-ready",
			title: "Bài mới vừa giao",
			due: "2030-01-12",
			note: "",
			createdAt: "2026-09-25T10:00:00.000Z",
			targets: [{ studentId: "st-1", submittedAt: null }],
		};
		currentDataFixture = {
			classAssignments: [caPendingOlder],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};

		const { rerender } = render(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				lastAssignedNonce={0}
			/>,
		);

		currentDataFixture = {
			classAssignments: [caNewest, caPendingOlder],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};
		rerender(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				lastAssignedNonce={1}
			/>,
		);

		const newestBtn = screen.getByRole("button", {
			name: /Bài mới vừa giao/,
		});
		expect(newestBtn.getAttribute("aria-expanded")).toBe("true");
	});

	it("chờ snapshot mới commit nếu lastAssignedNonce tăng trước khi bài mới xuất hiện (#717)", () => {
		const caPendingOlder: ClassAssignment = {
			id: "ca-pending-older",
			classId: "cl-1",
			promptId: "p-writing",
			title: "Bài cũ đang chờ chấm",
			due: "2030-01-05",
			note: "",
			createdAt: "2026-09-20T10:00:00.000Z",
			targets: [
				{
					studentId: "st-1",
					submittedAt: "2026-09-20T10:00:00.000Z",
					attemptId: "att-old",
					gradedAt: null,
					band: null,
				},
			],
		};
		const caNewest: ClassAssignment = {
			id: "ca-newest-async",
			classId: "cl-1",
			promptId: "p-ready",
			title: "Bài mới đến sau một nhịp",
			due: "2030-01-12",
			note: "",
			createdAt: "2026-09-25T10:00:00.000Z",
			targets: [{ studentId: "st-1", submittedAt: null }],
		};
		currentDataFixture = {
			classAssignments: [caPendingOlder],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};

		const baselineIds = new Set(["ca-pending-older"]);
		const { rerender } = render(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				lastAssignedNonce={0}
			/>,
		);

		// Nhịp 1: nonce đã tăng kèm baselineIds trước khi DataProvider commit snapshot mới
		rerender(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				lastAssignedNonce={1}
				lastAssignedTarget={{ baselineIds }}
			/>,
		);

		// Nhịp 2: snapshot mới về tới -> phải nhận ra ca-newest-async và tự mở sẵn
		currentDataFixture = {
			classAssignments: [caNewest, caPendingOlder],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};
		rerender(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				lastAssignedNonce={1}
				lastAssignedTarget={{ baselineIds }}
			/>,
		);

		const newestBtn = screen.getByRole("button", {
			name: /Bài mới đến sau một nhịp/,
		});
		expect(newestBtn.getAttribute("aria-expanded")).toBe("true");
	});

	it("formats HH:mm dd/mm/yyyy in assigned list when dueAt is present (#572)", () => {
		currentDataFixture = {
			classAssignments: [
				{
					id: "ca-timed",
					classId: "cl-1",
					promptId: "p-ready",
					title: "Writing Timed",
					due: "2030-11-06",
					dueAt: new Date(
						Date.parse("2030-11-06T17:30:00+07:00"),
					).toISOString(),
					note: "",
					createdAt: "2026-11-04T10:00:00.000Z",
					targets: [{ studentId: "st-1", submittedAt: null }],
				},
			],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};

		const html = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
			/>,
		);
		expect(html).toContain("Hạn 17:30 06/11/2030");
	});

	it("shows + Writing tag and enables Chấm bài link on submitted hybrid prompt targets (#574)", () => {
		const hybridPrompt = {
			id: "pr-hybrid-1",
			skill: "grammar",
			part: "tenses",
			type: "mcq",
			task: "task2",
			genre: "",
			title: "Grammar + Writing Homework",
			band: "6.5",
			source: "",
			prompt: "",
			note: "",
			status: "ready" as const,
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Discuss technology.</p>",
			},
			createdAt: "2026-11-04T00:00:00.000Z",
		};
		const caHybrid: ClassAssignment = {
			id: "ca-hyb-1",
			classId: testClass.id,
			promptId: "pr-hybrid-1",
			title: "Grammar + Writing Homework",
			due: "2026-11-10",
			note: "",
			createdAt: "2026-11-04T01:00:00.000Z",
			targets: [
				{
					studentId: "st-1",
					submittedAt: "2026-11-04T02:00:00.000Z",
					attemptId: "att-hyb-99",
					gradedAt: null,
					band: null,
				},
			],
		};
		currentDataFixture = {
			classAssignments: [caHybrid],
			assignmentPrompts: [...testPrompts, hybridPrompt],
			students: testStudents,
		};

		const listHtml = renderToStaticMarkup(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				assignmentsFocus
			/>,
		);
		expect(listHtml).toContain("+ Writing");
		expect(listHtml).toContain('href="/grading/att-hyb-99"');
		expect(listHtml).toContain("Chấm bài");
	});
});
