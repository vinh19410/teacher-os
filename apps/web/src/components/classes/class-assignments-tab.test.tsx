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

let currentDataFixture: {
	classAssignments: ClassAssignment[];
	assignmentPrompts: AssignmentPrompt[];
	students: Student[];
	viewer?: { role: string; canAccessFinance: boolean };
} = {
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
		"aria-label"?: string;
	}) => {
		const searchStr = props.search
			? `?${new URLSearchParams(props.search).toString()}`
			: "";
		return (
			<a
				href={`${props.to.replace("$attemptId", props.params?.attemptId ?? "")}${searchStr}`}
				className={props.className}
				aria-label={props["aria-label"]}
			>
				{props.children}
			</a>
		);
	},
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: currentDataFixture,
		studentById: (id: string) =>
			currentDataFixture.students.find((s) => s.id === id),
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

	it("shows grade links for submitted writing/speaking and 'Xem bài làm' link for submitted auto-graded targets", () => {
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
				{
					studentId: "st-2",
					submittedAt: null,
					attemptId: null,
					gradedAt: null,
					band: null,
				},
			],
		};
		const caMissingPromptGraded: ClassAssignment = {
			id: "ca-lib-graded",
			classId: "cl-1",
			promptId: "p-missing-library",
			title: "Writing Library Graded",
			due: "2030-01-07",
			note: "",
			createdAt: "2026-09-20T08:00:00.000Z",
			targets: [
				{
					studentId: "st-1",
					submittedAt: "2026-09-20T13:00:00.000Z",
					attemptId: "att-4",
					gradedAt: "2026-09-21T09:00:00.000Z",
					band: 7.0,
				},
			],
		};
		currentDataFixture = {
			classAssignments: [
				...testAssignments,
				caGrade,
				caRead,
				caMissingPromptGraded,
			],
			assignmentPrompts: testPrompts,
			students: testStudents,
		};

		render(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				assignmentsFocus
			/>,
		);

		expect(
			screen
				.getByRole("link", { name: "Chấm bài của Nguyễn Văn A" })
				.getAttribute("href"),
		).toBe("/grading/att-1?from=class");
		expect(screen.getByText("Đã chấm · Band 6.5")).toBeTruthy();
		expect(
			screen
				.getAllByRole("link", { name: "Xem / sửa điểm" })[0]
				?.getAttribute("href"),
		).toBe("/grading/att-2?from=class");

		const autoReviewLink = screen.getByRole("link", {
			name: "Xem bài làm của Nguyễn Văn A",
		});
		expect(autoReviewLink.getAttribute("href")).toBe(
			"/grading/att-3?from=class",
		);
		expect(autoReviewLink.textContent).toBe("Xem bài làm");

		// Missing promptRow (e.g. libraryRef) with existing band+gradedAt keeps TargetGradeActions
		expect(screen.getByText("Đã chấm · Band 7.0")).toBeTruthy();
		expect(
			screen
				.getAllByRole("link", { name: "Xem / sửa điểm" })
				.some((a) => a.getAttribute("href") === "/grading/att-4?from=class"),
		).toBe(true);
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
		expect(listHtml).toContain('href="/grading/att-hyb-99?from=class"');
		expect(listHtml).toContain("Chấm bài");
	});

	it("hiển thị phạm vi Giao X/Y HV và nút Giao bổ sung khi thiếu học viên đang học, ẩn khi đã đủ", () => {
		const run = vi.fn().mockResolvedValue({ kind: "refreshed" });
		const partialCa: ClassAssignment = {
			id: "ca-partial",
			classId: "cl-1",
			promptId: "p-ready",
			title: "Bài kiểm nhanh GrammarI",
			due: "2026-09-12",
			note: "",
			createdAt: "2026-09-10T10:00:00.000Z",
			targets: [{ studentId: "st-1", submittedAt: null }],
		};
		currentDataFixture = {
			classAssignments: [partialCa],
			assignmentPrompts: testPrompts,
			students: testStudents,
			viewer: { role: "teacher", canAccessFinance: true },
		};

		render(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				run={run}
				isPending={() => false}
				busy={false}
			/>,
		);

		expect(screen.getAllByText(/0\/1 đã nộp/)).toHaveLength(2);
		expect(screen.getByText(/Giao 1\/2 HV/)).toBeTruthy();
		expect(screen.getByText(/Còn 1 học viên chưa được giao/)).toBeTruthy();
		expect(screen.getByText(/Trần Thị B/)).toBeTruthy();

		const addBtn = screen.getByRole("button", { name: "Giao bổ sung" });
		fireEvent.click(addBtn);
		expect(run).toHaveBeenCalledWith(
			"add-targets-ca-partial",
			{
				type: "add-class-assignment-targets",
				classId: "cl-1",
				assignmentId: "ca-partial",
				studentIds: ["st-2"],
			},
			expect.any(Function),
		);
		const formatToast = run.mock.calls[0]?.[2] as (res: {
			kind: "refreshed";
			added?: number;
		}) => string;
		expect(formatToast({ kind: "refreshed", added: 1 })).toBe(
			"Đã giao bổ sung cho 1 học viên.",
		);
		expect(formatToast({ kind: "refreshed", added: 0 })).toBe(
			"Học viên đã được giao bài này trước đó.",
		);

		// Khi đã giao đủ 2/2 HV active -> không hiện "Giao 2/2 HV" và không hiện nút "Giao bổ sung"
		cleanup();
		currentDataFixture = {
			classAssignments: [
				{
					...partialCa,
					targets: [
						{ studentId: "st-1", submittedAt: null },
						{ studentId: "st-2", submittedAt: null },
					],
				},
			],
			assignmentPrompts: testPrompts,
			students: testStudents,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		render(
			<ClassAssignmentsTab
				classGroup={testClass}
				onOpenAssignModal={vi.fn()}
				run={run}
				isPending={() => false}
				busy={false}
			/>,
		);
		expect(screen.queryByText(/Giao 2\/2 HV/)).toBeNull();
		expect(screen.queryByRole("button", { name: /Giao bổ sung/ })).toBeNull();
	});

	it("cắt lô tối đa 100 học viên khi bấm Giao bổ sung trên lớp > 100 HV còn thiếu và ẩn nút với TA hoặc lớp paused", () => {
		const run = vi.fn().mockResolvedValue({ kind: "refreshed" });
		const manyStudents: Student[] = Array.from({ length: 106 }, (_, idx) => ({
			...testStudents[0],
			id: `st-m-${idx + 1}`,
			name: `Học viên ${idx + 1}`,
			avatar: "HV",
		}));
		const bigClass: ClassGroup = {
			...testClass,
			studentIds: manyStudents.map((s) => s.id),
		};
		const partialBig: ClassAssignment = {
			id: "ca-big",
			classId: bigClass.id,
			promptId: "p-ready",
			title: "Big Class Quiz",
			due: "2030-01-10",
			note: "",
			createdAt: "2026-09-10T10:00:00.000Z",
			targets: [{ studentId: "st-m-1", submittedAt: null }],
		};
		currentDataFixture = {
			classAssignments: [partialBig],
			assignmentPrompts: testPrompts,
			students: manyStudents,
			viewer: { role: "teacher", canAccessFinance: true },
		};

		const { rerender } = render(
			<ClassAssignmentsTab
				classGroup={bigClass}
				onOpenAssignModal={vi.fn()}
				run={run}
				isPending={() => false}
				busy={false}
			/>,
		);

		expect(screen.getByText(/Giao 1\/106 HV/)).toBeTruthy();
		const batchBtn = screen.getByRole("button", {
			name: "Giao bổ sung (100 HV)",
		});
		fireEvent.click(batchBtn);
		expect(run).toHaveBeenCalledTimes(1);
		const dispatchedAction = run.mock.calls[0]?.[1] as {
			type: string;
			studentIds: string[];
		};
		expect(dispatchedAction.type).toBe("add-class-assignment-targets");
		expect(dispatchedAction.studentIds).toHaveLength(100);
		expect(dispatchedAction.studentIds[0]).toBe("st-m-2");
		expect(dispatchedAction.studentIds[99]).toBe("st-m-101");

		// TA role -> ẩn nút Giao bổ sung
		currentDataFixture = {
			...currentDataFixture,
			viewer: { role: "ta", canAccessFinance: false },
		};
		rerender(
			<ClassAssignmentsTab
				classGroup={bigClass}
				onOpenAssignModal={vi.fn()}
				run={run}
				isPending={() => false}
				busy={false}
			/>,
		);
		expect(screen.queryByRole("button", { name: /Giao bổ sung/ })).toBeNull();

		// Paused class -> ẩn nút Giao bổ sung ngay cả với teacher
		currentDataFixture = {
			...currentDataFixture,
			viewer: { role: "teacher", canAccessFinance: true },
		};
		rerender(
			<ClassAssignmentsTab
				classGroup={{ ...bigClass, status: "paused" }}
				onOpenAssignModal={vi.fn()}
				run={run}
				isPending={() => false}
				busy={false}
			/>,
		);
		expect(screen.queryByRole("button", { name: /Giao bổ sung/ })).toBeNull();
	});
});
