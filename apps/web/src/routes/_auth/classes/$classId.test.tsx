// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
	syllabusRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { Route } from "./$classId";

const ClassDetail = (Route as unknown as { component: () => React.ReactNode })
	.component;

const twoClasses = () =>
	snapshotFixture({
		classes: [
			classRow({ id: "cl-1", name: "IELTS Writing" }),
			classRow({ id: "cl-2", name: "IELTS Speaking" }),
		],
		students: [
			studentRow({ id: "st-1", name: "Học viên Một" }),
			studentRow({ id: "st-2", name: "Học viên Hai" }),
		],
		enrollments: [enrollmentRow({ classId: "cl-1", studentId: "st-1" })],
	});

beforeEach(() => {
	resetRouterState();
	routerState.params = { classId: "cl-1" };
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function openEnrollDialog() {
	fireEvent.click(
		await screen.findByRole("button", { name: "+ Thêm học viên vào lớp" }),
	);
	return screen.getByRole("dialog");
}

describe("class detail → enroll an existing student", () => {
	it("offers only students not yet in the viewed class", async () => {
		startKernelServer(twoClasses());
		renderWithKernel(<ClassDetail />);
		const dialog = await openEnrollDialog();
		const options = within(dialog).getAllByRole("option");
		expect(options.map((o) => o.textContent)).toEqual([
			expect.stringContaining("Học viên Hai"),
		]);
	});

	it("enrolls the picked student into the viewed class and closes after the refresh", async () => {
		const snapshot = twoClasses();
		// Two eligible students so a wrong pick cannot pass by coincidence.
		snapshot.students.unshift(
			studentRow({ id: "st-0", name: "Học viên Không" }),
		);
		const server = startKernelServer(snapshot, (req, srv) => {
			if (req.path === "/api/classes/cl-1/enroll") {
				srv.snapshot.enrollments.push(
					enrollmentRow({
						id: "en-2",
						classId: "cl-1",
						studentId: "st-2",
						status: "invited",
					}),
				);
			}
			return undefined;
		});
		renderWithKernel(<ClassDetail />);
		const dialog = await openEnrollDialog();
		fireEvent.click(
			within(dialog).getByRole("option", { name: /Học viên Hai/ }),
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/enroll",
				body: { studentId: "st-2" },
			},
		]);
		expect(await screen.findByText("Học viên Hai")).toBeTruthy();
	});

	it("keeps the dialog open with an error when the enroll is rejected", async () => {
		startKernelServer(twoClasses(), () => ({ status: 422, body: {} }));
		renderWithKernel(<ClassDetail />);
		const dialog = await openEnrollDialog();
		fireEvent.click(
			within(dialog).getByRole("option", { name: /Học viên Hai/ }),
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		expect(await within(dialog).findByRole("alert")).toBeTruthy();
		expect(screen.getByRole("dialog")).toBe(dialog);
	});

	it("drops a pick made on another class when the route switches class", async () => {
		// Nobody is enrolled anywhere, so the student picked on class 1 is also
		// eligible on class 2 — a leaked pick would enroll them there on Lưu.
		const server = startKernelServer({ ...twoClasses(), enrollments: [] });
		renderWithKernel(<RerenderableClassDetail />);
		const dialog = await openEnrollDialog();
		fireEvent.click(
			within(dialog).getByRole("option", { name: /Học viên Hai/ }),
		);

		// Param change re-renders the mounted route; it never remounts.
		routerState.params = { classId: "cl-2" };
		fireEvent.click(screen.getByTestId("rerender"));

		await screen.findByRole("heading", { name: "IELTS Speaking" });
		const next = screen.getByRole("dialog");
		for (const option of within(next).getAllByRole("option")) {
			expect(option.getAttribute("aria-selected")).toBe("false");
		}
		expect(
			(within(next).getByRole("button", { name: "Lưu" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(server.writes).toEqual([]);
	});
});

function RerenderableClassDetail() {
	const [, bump] = useReducer((n: number) => n + 1, 0);
	return (
		<>
			<button type="button" data-testid="rerender" onClick={bump} hidden />
			<ClassDetail />
		</>
	);
}

describe("class detail tabs", () => {
	it("offers roster, sessions, assignments, vocab and notes — syllabus and schedule live inside sessions", async () => {
		startKernelServer(twoClasses());
		renderWithKernel(<ClassDetail />);
		const tabs = await screen.findAllByRole("tab");
		expect(tabs.map((t) => t.textContent)).toEqual([
			"Học viên",
			"Buổi học",
			"Bài tập",
			"Từ vựng",
			"Ghi chú",
		]);
	});
});

describe("class detail → Buổi học tab", () => {
	const SCHEDULE = '{"days":[1,4],"start":"19:00","end":"20:30"}';
	const lesson = (
		id: string,
		title: string,
		materials = "",
		objectives = "",
	) => ({
		id,
		title,
		objectives,
		materials,
		kind: "lesson" as const,
		status: "upcoming" as const,
	});

	function attachedCopy() {
		return snapshotFixture({
			classes: [
				classRow({
					id: "cl-1",
					name: "IELTS Writing",
					syllabusId: "sy-c",
					schedule: SCHEDULE,
					startDate: "2026-08-24",
					sessionsTotal: 2,
				}),
			],
			syllabi: [
				syllabusRow({
					id: "sy-c",
					name: "Writing 7.0 (bản lớp)",
					classId: "cl-1",
					sourceTemplateId: "sy-t",
					totalLessons: 2,
					modules: [
						{
							id: "m-a",
							title: "Module A",
							description: "",
							lessons: [
								lesson("l-1", "Line chart", "Cam 15", "So sánh số liệu"),
								lesson("l-2", "Bar chart"),
							],
						},
					],
				}),
			],
		});
	}

	async function openSessionsTab() {
		fireEvent.click(await screen.findByRole("tab", { name: "Buổi học" }));
	}

	function headers(): string[] {
		return screen
			.getAllByRole("columnheader")
			.map((th) => th.textContent?.trim() ?? "");
	}

	it("lists each session with date & time, syllabus topic and status — no student column", async () => {
		startKernelServer(attachedCopy());
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		expect(headers()).toEqual(["Ngày & Giờ", "Chủ đề", "Trạng thái"]);
		const rows = screen.getAllByRole("row").slice(1);
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain("Module A");
		expect(rows[0].textContent).toContain("Line chart");
		expect(rows[1].textContent).toContain("Bar chart");
	});

	it("expands a session into its lesson materials and objectives across the full row", async () => {
		startKernelServer(attachedCopy());
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		fireEvent.click(
			screen.getAllByRole("button", { name: "Mở rộng chi tiết bài học" })[0],
		);
		const details = screen.getByRole("row", { name: "Chi tiết lesson" });
		const cells = details.querySelectorAll("td");
		expect(cells).toHaveLength(1);
		expect(cells[0].getAttribute("colspan")).toBe(String(headers().length));
		expect(details.textContent).toContain("Tài liệu: Cam 15");
		expect(details.textContent).toContain("Mục tiêu: So sánh số liệu");
	});

	it("falls back to the weekday table for a legacy free-text schedule", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", schedule: "T3 19:00" })],
				students: [studentRow({ id: "st-1" })],
				enrollments: [enrollmentRow({ classId: "cl-1", studentId: "st-1" })],
				lessons: [
					{
						id: "les-1",
						classId: "cl-1",
						enrollmentId: "en-1",
						day: 2,
						time: "19:00",
						dur: 60,
						date: null,
						type: "1:1",
						status: "completed",
						topic: "Task 2 cũ",
						zoom: "",
					} as never,
				],
			}),
		);
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		expect(headers()).toEqual(["Ngày", "Giờ", "Chủ đề", "Trạng thái"]);
		expect(screen.getByText("Task 2 cũ")).toBeTruthy();
	});

	it("shows the attached copy as one card that removes it after confirmation", async () => {
		const server = startKernelServer(attachedCopy());
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		const card = screen
			.getByText("Writing 7.0 (bản lớp)")
			.closest(".mb-4") as HTMLElement;
		expect(card.textContent).toContain("2 buổi");
		// Progress and the module tree belong to the header and manage modal.
		// <Progress> has no ARIA role; its fill is the only width-styled node.
		expect(card.querySelector('[style*="width"]')).toBeNull();
		expect(within(card).queryByText(/Mở rộng|Thu gọn/)).toBeNull();
		expect(within(card).queryByText("Line chart")).toBeNull();

		fireEvent.click(
			within(card).getByRole("button", { name: "Gỡ giáo trình" }),
		);
		const dialog = screen.getByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Gỡ giáo trình" }),
		);
		await waitFor(() =>
			expect(server.writes).toEqual([
				{
					method: "POST",
					path: "/api/classes/cl-1/remove-curriculum",
					body: {},
				},
			]),
		);
	});

	it("offers importing a template when the class has no syllabus", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", syllabusId: null })],
				syllabi: [syllabusRow({ id: "sy-t", name: "Template A" })],
			}),
		);
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		fireEvent.click(screen.getByRole("button", { name: "Nhập từ template" }));
		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).getByRole("option", { name: "Template A" }),
		).toBeTruthy();
	});
});

describe("class screen → lesson kind stays with the syllabus", () => {
	it("adds a lesson from the class without offering to change its kind", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", syllabusId: "sy-c" })],
				syllabi: [
					syllabusRow({
						id: "sy-c",
						classId: "cl-1",
						modules: [
							{ id: "m-1", title: "Module 1", description: "", lessons: [] },
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);
		fireEvent.click(await screen.findByRole("tab", { name: "Buổi học" }));
		fireEvent.click(screen.getByRole("button", { name: "Sắp xếp buổi" }));
		fireEvent.click(screen.getByRole("button", { name: "+ Thêm buổi học" }));
		const dialog = screen
			.getAllByRole("dialog")
			.find((d) => d.textContent?.includes("Thêm buổi học")) as HTMLElement;
		expect(within(dialog).queryByLabelText("Loại buổi học")).toBeNull();
		expect(within(dialog).getByLabelText("Trạng thái")).toBeTruthy();
	});
});
