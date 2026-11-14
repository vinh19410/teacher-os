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
import { useData } from "@/lib/data-store";
import {
	classRow,
	enrollmentRow,
	lessonRow,
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
	// #391: nút "+ Thêm học viên vào lớp" sống trong tab Học viên.
	fireEvent.click(await screen.findByRole("tab", { name: "Học viên" }));
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
				body: { studentId: "st-2", activateNow: false },
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
	it("offers Buổi học & luyện tập, roster, curriculum, vocab and notes — sessions & assignments merged (#391, #520)", async () => {
		startKernelServer(twoClasses());
		renderWithKernel(<ClassDetail />);
		const tabs = await screen.findAllByRole("tab");
		expect(tabs.map((t) => t.textContent)).toEqual([
			"Buổi học & luyện tập",
			"Học viên",
			"Giáo trình",
			"Từ vựng",
			"Ghi chú",
		]);
		expect(screen.getByText("Từ 01/08")).toBeTruthy();
	});

	it("formats ISO startDate as dd/mm/yyyy in the student stat card subtitle and omits empty startDate (#520)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						startDate: "2026-11-03",
					}),
					classRow({
						id: "cl-2",
						name: "IELTS Speaking",
						startDate: "",
					}),
				],
			}),
		);
		renderWithKernel(<RerenderableClassDetail />);
		expect(await screen.findByText("Từ 03/11/2026")).toBeTruthy();
		expect(screen.queryByText("Từ 2026-11-03")).toBeNull();

		routerState.params = { classId: "cl-2" };
		fireEvent.click(screen.getByTestId("rerender"));
		await screen.findByRole("heading", { name: "IELTS Speaking" });
		expect(screen.queryByText("Từ")).toBeNull();
		expect(screen.queryByText(/^Từ \d/)).toBeNull();
	});

	it("selects Buổi học & luyện tập when opened with legacy ?tab=assignments (#391, #520)", async () => {
		routerState.search = { tab: "assignments" };
		startKernelServer(twoClasses());
		renderWithKernel(<ClassDetail />);
		const tab = await screen.findByRole("tab", {
			name: "Buổi học & luyện tập",
		});
		expect(tab.getAttribute("aria-selected")).toBe("true");
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
		fireEvent.click(
			await screen.findByRole("tab", { name: "Buổi học & luyện tập" }),
		);
	}

	it("lists each session as a card with date & time, syllabus topic and status — no student column (#391)", async () => {
		startKernelServer(attachedCopy());
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		const rows = screen.getAllByTestId("session-row");
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain("Module A");
		expect(rows[0].textContent).toContain("Line chart");
		expect(rows[1].textContent).toContain("Bar chart");
	});

	it("expands a session card into its lesson materials and objectives", async () => {
		startKernelServer(attachedCopy());
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		fireEvent.click(
			screen.getAllByRole("button", { name: "Mở rộng chi tiết bài học" })[0],
		);
		const card = screen.getAllByTestId("session-row")[0];
		expect(card.textContent).toContain("Tài liệu: Cam 15");
		expect(card.textContent).toContain("Mục tiêu: So sánh số liệu");
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

		// #391: fallback legacy là bảng 4 cột trần trong Section "Sessions".
		expect(screen.getByText("Task 2 cũ")).toBeTruthy();
	});

	it("shows the attached copy as one card that removes it after confirmation", async () => {
		const server = startKernelServer(attachedCopy());
		renderWithKernel(<ClassDetail />);
		// #391: khối giáo trình chuyển sang tab "Giáo trình" riêng.
		fireEvent.click(await screen.findByRole("tab", { name: "Giáo trình" }));

		const card = screen
			.getByText("Writing 7.0 (bản lớp)")
			.closest("section") as HTMLElement;
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
					path: "/api/classes/cl-1/curriculum/remove",
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
		// #391: khối giáo trình chuyển sang tab "Giáo trình" riêng.
		fireEvent.click(await screen.findByRole("tab", { name: "Giáo trình" }));

		fireEvent.click(screen.getByRole("button", { name: "Nhập từ template" }));
		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).getByRole("option", { name: "Template A · 0 buổi" }),
		).toBeTruthy();
	});

	it("shows + Thêm buổi học button when class has no syllabus and opens manual session modal (Issue #649)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						syllabusId: null,
						schedulingMode: "manual",
						sessionsTotal: 0,
					}),
				],
				syllabi: [syllabusRow({ id: "sy-t", name: "Template A" })],
			}),
		);
		renderWithKernel(<ClassDetail />);
		const addSessionBtns = (await screen.findAllByRole("button", {
			name: "+ Thêm buổi học",
		})) as HTMLButtonElement[];
		expect(screen.queryByRole("button", { name: "+ Thêm buổi" })).toBeNull();
		expect(addSessionBtns).toHaveLength(2);
		expect(
			screen.getByRole("button", { name: "Nhập buổi từ syllabus" }),
		).toBeTruthy();

		fireEvent.click(addSessionBtns[0]);
		const dialog = screen.getByRole("dialog", {
			name: "Thêm buổi học thủ công",
		});
		expect(dialog).toBeTruthy();
		expect(within(dialog).getByLabelText(/Chủ đề buổi học/)).toBeTruthy();

		fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
		expect(
			screen.queryByRole("dialog", { name: "Thêm buổi học thủ công" }),
		).toBeNull();

		// Giáo trình tab still accessible
		fireEvent.click(screen.getByRole("tab", { name: "Giáo trình" }));
		expect(
			screen.getByRole("button", { name: "Nhập từ template" }),
		).toBeTruthy();
	});

	it("imports syllabus directly from the empty Sessions state and switches to projected sessions", async () => {
		const templateModules = [
			{
				id: "m-a",
				title: "Module A",
				description: "",
				lessons: [lesson("l-1", "Line chart"), lesson("l-2", "Bar chart")],
			},
		];
		const server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						syllabusId: null,
						schedulingMode: "manual",
						sessionsTotal: 0,
						schedule: SCHEDULE,
						startDate: "2026-08-24",
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-t",
						name: "Template A",
						totalLessons: 2,
						modules: templateModules,
					}),
				],
			}),
			(req, srv) => {
				if (req.path === "/api/classes/cl-1/curriculum/import") {
					srv.snapshot.syllabi.push(
						syllabusRow({
							id: "sy-copy",
							name: "Template A",
							classId: "cl-1",
							sourceTemplateId: "sy-t",
							totalLessons: 2,
							modules: templateModules,
						}),
					);
					srv.snapshot.classes[0] = {
						...srv.snapshot.classes[0],
						syllabusId: "sy-copy",
						schedulingMode: "auto",
						sessionsTotal: 2,
					};
					return { status: 201, body: { id: "sy-copy" } };
				}
				return undefined;
			},
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(
			await screen.findByRole("button", { name: "Nhập buổi từ syllabus" }),
		);
		const dialog = screen.getByRole("dialog", {
			name: "Nhập giáo trình từ template",
		});
		const select = within(dialog).getByLabelText(
			"Template giáo trình",
		) as HTMLSelectElement;
		expect(
			within(dialog).getByRole("option", { name: "Template A · 2 buổi" }),
		).toBeTruthy();
		expect(select.value).toBe("sy-t");

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/curriculum/import",
				body: { templateId: "sy-t" },
			},
		]);

		expect(
			await screen.findByRole("button", { name: "Sắp xếp buổi" }),
		).toBeTruthy();
		expect(screen.queryByText("Chưa có buổi học nào")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Nhập buổi từ syllabus" }),
		).toBeNull();
		const rows = screen.getAllByTestId("session-row");
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain("Line chart");
		expect(rows[1].textContent).toContain("Bar chart");
	});

	it("shows Sắp xếp buổi button when class has a syllabus", async () => {
		startKernelServer(attachedCopy());
		renderWithKernel(<ClassDetail />);
		const manageBtn = (await screen.findByRole("button", {
			name: "Sắp xếp buổi",
		})) as HTMLButtonElement;
		expect(manageBtn.disabled).toBe(false);

		fireEvent.click(manageBtn);
		expect(
			screen.getByRole("dialog", { name: "Quản lý buổi của lớp" }),
		).toBeTruthy();
	});

	it("renders manual session for class with 0 students and allows deletion (Issue #649)", async () => {
		const server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						syllabusId: null,
						schedulingMode: "manual",
						sessionsTotal: 1,
					}),
				],
				classSessions: [
					{
						id: "cs-1",
						classId: "cl-1",
						date: "2026-11-12",
						time: "19:00",
						dur: 90,
						topic: "Task 1 Line Chart",
						zoom: "",
					},
				],
			}),
		);
		renderWithKernel(<ClassDetail />);
		await openSessionsTab();

		expect(await screen.findByText("Task 1 Line Chart")).toBeTruthy();
		expect(screen.getByRole("button", { name: "+ Thêm buổi" })).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Nhập buổi từ syllabus" }),
		).toBeNull();
		const adjustBtn = await screen.findByRole("button", { name: "Điều chỉnh" });
		fireEvent.click(adjustBtn);

		const dialog = await screen.findByRole("dialog", {
			name: /Điều chỉnh buổi/,
		});
		expect(dialog).toBeTruthy();
		expect(
			within(dialog).getByText("Chưa có học viên nào trong lớp."),
		).toBeTruthy();
		const topicInput = within(dialog).getByLabelText(
			/Chủ đề/,
		) as HTMLInputElement;
		expect(topicInput.value).toBe("Task 1 Line Chart");

		fireEvent.change(topicInput, { target: { value: "Updated Line Chart" } });
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() => {
			expect(server.writes).toContainEqual({
				method: "POST",
				path: "/api/classes/cl-1/sessions/2026-11-12/edit",
				body: { topic: "Updated Line Chart" },
			});
		});

		const deleteBtn = within(dialog).getByRole("button", {
			name: "Xóa buổi học",
		});
		fireEvent.click(deleteBtn);

		const confirmBtn = within(dialog).getByRole("button", { name: "Xác nhận" });
		fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(server.writes).toContainEqual({
				method: "DELETE",
				path: "/api/classes/cl-1/sessions/2026-11-12",
				body: null,
			});
		});
	});

	it("projects syllabus sessions even when legacy row has schedulingMode='manual' and sessionsTotal=0 (#670)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						syllabusId: "sy-c",
						schedulingMode: "manual",
						sessionsTotal: 0,
						schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
						startDate: "2026-11-16",
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-c",
						classId: "cl-1",
						totalLessons: 3,
						modules: [
							{
								id: "m-1",
								title: "Module 1",
								description: "",
								lessons: [
									{
										id: "sl-1",
										title: "Buổi A1",
										objectives: "",
										materials: "",
										kind: "lesson",
										status: "upcoming",
									},
									{
										id: "sl-2",
										title: "Thi giữa kỳ A",
										objectives: "",
										materials: "",
										kind: "midterm",
										status: "upcoming",
									},
									{
										id: "sl-3",
										title: "Buổi B1",
										objectives: "",
										materials: "",
										kind: "lesson",
										status: "upcoming",
									},
								],
							},
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		expect(
			await screen.findByRole("button", { name: "Sắp xếp buổi" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "+ Thêm buổi học" }),
		).toBeNull();

		expect(screen.queryByText("Chưa có buổi học nào")).toBeNull();
		const rows = await screen.findAllByTestId("session-row");
		expect(rows).toHaveLength(3);
		expect(await screen.findByText("Buổi A1")).toBeTruthy();
		expect(screen.getByText("Thi giữa kỳ A")).toBeTruthy();
		expect(screen.getByText("Buổi B1")).toBeTruthy();
	});

	it("hides both Sắp xếp buổi and + Thêm buổi học when auto class has real lessons after removing curriculum (#670)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						syllabusId: null,
						schedulingMode: "auto",
						sessionsTotal: 2,
						schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
						startDate: "2026-11-16",
					}),
				],
				students: [studentRow({ id: "st-1", name: "Học viên Một" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
				],
				lessons: [
					lessonRow({
						id: "l-1",
						classId: "cl-1",
						enrollmentId: "en-1",
						day: 1,
						date: "2026-11-16",
						time: "19:00",
						dur: 90,
						topic: "Bài 1",
					}),
					lessonRow({
						id: "l-2",
						classId: "cl-1",
						enrollmentId: "en-1",
						day: 1,
						date: "2026-11-23",
						time: "19:00",
						dur: 90,
						topic: "Bài 2",
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		expect(await screen.findByText("Bài 1")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Sắp xếp buổi" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "+ Thêm buổi học" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "+ Thêm buổi" })).toBeNull();
	});

	it("hides manual and import CTAs in empty Sessions state when an empty 0-lesson syllabus is already attached", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						syllabusId: "sy-c",
						sessionsTotal: 0,
						schedule: SCHEDULE,
						startDate: "2026-08-24",
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-c",
						classId: "cl-1",
						totalLessons: 0,
						modules: [
							{ id: "m-1", title: "Module 1", description: "", lessons: [] },
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		expect(await screen.findByText("Chưa có buổi học nào")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "+ Thêm buổi" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "+ Thêm buổi học" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Nhập buổi từ syllabus" }),
		).toBeNull();
		expect(
			screen.getByText(/Giáo trình của lớp hiện chưa có bài học nào/),
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
		fireEvent.click(
			await screen.findByRole("tab", { name: "Buổi học & luyện tập" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Sắp xếp buổi" }));
		fireEvent.click(screen.getByRole("button", { name: "+ Thêm buổi học" }));
		const dialog = screen.getByRole("dialog", { name: "Thêm buổi học" });
		expect(within(dialog).queryByLabelText("Loại buổi học")).toBeNull();
		expect(within(dialog).getByLabelText("Trạng thái")).toBeTruthy();
	});
});

describe("class detail → edit class info (#693)", () => {
	it("opens EditClassModal from PageHead Chỉnh sửa button and updates class info when unlocked", async () => {
		const snapshot = snapshotFixture({
			classes: [
				classRow({
					id: "cl-1",
					name: "IELTS Writing",
					schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}',
					startDate: "2026-12-01",
					sessionsTotal: 12,
				}),
				classRow({
					id: "cl-2",
					name: "IELTS Speaking",
					schedule: '{"days":[4],"start":"19:00","end":"20:30"}',
					startDate: "2026-12-01",
					sessionsTotal: 12,
				}),
			],
		});
		const server = startKernelServer(snapshot, (req, srv) => {
			if (req.method === "PATCH" && req.path === "/api/classes/cl-1") {
				const body = req.body as Record<string, unknown>;
				const target = srv.snapshot.classes.find((c) => c.id === "cl-1");
				if (target) {
					target.name = String(body.name ?? target.name);
					target.mode = String(body.mode ?? target.mode);
					if (body.schedule) {
						target.schedule = JSON.stringify(body.schedule);
					}
				}
			}
			return undefined;
		});
		renderWithKernel(<ClassDetail />);

		fireEvent.click(await screen.findByRole("button", { name: "Chỉnh sửa" }));
		const dialog = screen.getByRole("dialog", { name: "Chỉnh sửa lớp học" });
		expect(
			(within(dialog).getByLabelText("Giờ bắt đầu") as HTMLInputElement)
				.disabled,
		).toBe(false);
		expect(
			within(dialog).queryByTestId("schedule-conflict-warning"),
		).toBeNull();

		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "IELTS Writing Pro" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "T6" }));
		expect(
			within(dialog).getByTestId("schedule-conflict-warning").textContent,
		).toContain("IELTS Speaking");

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Chỉnh sửa lớp học" }),
			).toBeNull(),
		);
		expect(server.writes).toContainEqual({
			method: "PATCH",
			path: "/api/classes/cl-1",
			body: {
				name: "IELTS Writing Pro",
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing"],
				mode: "Online",
				tuitionFee: null,
				schedule: { days: [0, 2, 4], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
			},
		});
		expect(
			await screen.findByRole("heading", { name: "IELTS Writing Pro" }),
		).toBeTruthy();
	});

	it("locks schedule controls when class already has real lessons and keeps EditClassFeeModal working", async () => {
		const snapshot = snapshotFixture({
			classes: [
				classRow({
					id: "cl-1",
					name: "IELTS Writing",
					schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
					startDate: "2026-08-01",
					sessionsTotal: 12,
				}),
			],
			students: [studentRow({ id: "st-1", name: "Học viên Một" })],
			enrollments: [
				enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
			],
			lessons: [
				lessonRow({
					id: "les-1",
					classId: "cl-1",
					enrollmentId: "en-1",
					date: "2026-08-03",
				}),
			],
		});
		const server = startKernelServer(snapshot);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(await screen.findByRole("button", { name: "Chỉnh sửa" }));
		const dialog = screen.getByRole("dialog", { name: "Chỉnh sửa lớp học" });
		expect(within(dialog).getByTestId("schedule-locked-note")).toBeTruthy();
		expect(
			(within(dialog).getByLabelText("Giờ bắt đầu") as HTMLInputElement)
				.disabled,
		).toBe(true);
		fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));
		expect(
			screen.queryByRole("dialog", { name: "Chỉnh sửa lớp học" }),
		).toBeNull();

		// Tab Học viên vẫn giữ EditClassFeeModal với nút "Sửa"
		fireEvent.click(screen.getByRole("tab", { name: "Học viên" }));
		fireEvent.click(await screen.findByRole("button", { name: "Sửa" }));
		const feeDialog = screen.getByRole("dialog", { name: "Sửa học phí lớp" });
		expect(feeDialog).toBeTruthy();
		fireEvent.click(within(feeDialog).getByRole("button", { name: "Hủy" }));
		expect(server.writes).toEqual([]);
	});
});

describe("class detail → ClassSessionsManageModal session datetime (#697)", () => {
	const SCHEDULE = '{"days":[1,4],"start":"19:00","end":"20:30"}';
	const makeSyllabusLesson = (id: string, title: string) => ({
		id,
		title,
		objectives: "",
		materials: "",
		kind: "lesson" as const,
		status: "upcoming" as const,
	});

	it("renders Buổi N + date/time across modules and updates immediately on lesson/module reorder", async () => {
		const snapshot = snapshotFixture({
			classes: [
				classRow({
					id: "cl-1",
					name: "IELTS Writing",
					syllabusId: "sy-c",
					schedule: SCHEDULE,
					startDate: "2026-08-24",
					sessionsTotal: 3,
				}),
			],
			syllabi: [
				syllabusRow({
					id: "sy-c",
					name: "Writing 7.0",
					classId: "cl-1",
					sourceTemplateId: "sy-t",
					totalLessons: 3,
					modules: [
						{
							id: "m-a",
							title: "Unit 1",
							description: "",
							lessons: [
								makeSyllabusLesson("l-1", "Family (Collocations)"),
								makeSyllabusLesson("l-2", "Family (*Listening)"),
							],
						},
						{
							id: "m-b",
							title: "Unit 2",
							description: "",
							lessons: [makeSyllabusLesson("l-3", "Work (*Grammar)")],
						},
					],
				}),
			],
		});

		startKernelServer(snapshot, (req, srv) => {
			const sy = srv.snapshot.syllabi[0];
			if (!sy) return undefined;
			if (req.path.endsWith("/modules/reorder")) {
				const { moduleIds } = req.body as { moduleIds: string[] };
				sy.modules.sort(
					(a, b) => moduleIds.indexOf(a.id) - moduleIds.indexOf(b.id),
				);
			}
			const lessonReorderMatch = req.path.match(
				/\/modules\/([^/]+)\/lessons\/reorder$/,
			);
			if (lessonReorderMatch) {
				const mod = sy.modules.find((m) => m.id === lessonReorderMatch[1]);
				const { lessonIds } = req.body as { lessonIds: string[] };
				mod?.lessons.sort(
					(a, b) => lessonIds.indexOf(a.id) - lessonIds.indexOf(b.id),
				);
			}
			return undefined;
		});

		renderWithKernel(<ClassDetail />);
		const sessionRows = await screen.findAllByTestId("session-row");
		expect(sessionRows).toHaveLength(3);
		expect(sessionRows[0].textContent).toContain("Thứ Ba, 25/08 · 19:00–20:30");
		expect(sessionRows[1].textContent).toContain(
			"Thứ Sáu, 28/08 · 19:00–20:30",
		);
		expect(sessionRows[2].textContent).toContain("Thứ Ba, 01/09 · 19:00–20:30");

		fireEvent.click(screen.getByRole("button", { name: "Sắp xếp buổi" }));
		const dialog = screen.getByRole("dialog", { name: "Quản lý buổi của lớp" });

		const slotsBefore = within(dialog)
			.getAllByTestId("curriculum-lesson-slot")
			.map((el) => el.textContent);
		expect(slotsBefore).toEqual([
			"Buổi 1 · Thứ Ba, 25/08 · 19:00–20:30",
			"Buổi 2 · Thứ Sáu, 28/08 · 19:00–20:30",
			"Buổi 3 · Thứ Ba, 01/09 · 19:00–20:30",
		]);

		// Di chuyển bài 2 lên vị trí 1 -> nhận mốc Buổi 1 (25/08)
		fireEvent.click(
			within(dialog).getByRole("button", {
				name: "Đưa Family (*Listening) lên",
			}),
		);
		await waitFor(() => {
			const lessonTitles = Array.from(
				dialog.querySelectorAll("div[class*='grid-cols-[20px_1fr_auto']"),
			).map((row) => ({
				slot: within(row as HTMLElement).getByTestId("curriculum-lesson-slot")
					.textContent,
				title: row.textContent,
			}));
			expect(lessonTitles[0].slot).toBe("Buổi 1 · Thứ Ba, 25/08 · 19:00–20:30");
			expect(lessonTitles[0].title).toContain("Family (*Listening)");
			expect(lessonTitles[1].slot).toBe(
				"Buổi 2 · Thứ Sáu, 28/08 · 19:00–20:30",
			);
			expect(lessonTitles[1].title).toContain("Family (Collocations)");
		});

		// Đưa Unit 2 lên trước Unit 1 -> Work (*Grammar) nhận mốc Buổi 1 (25/08)
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Đưa Unit 2 lên" }),
		);
		await waitFor(() => {
			const rows = Array.from(
				dialog.querySelectorAll("div[class*='grid-cols-[20px_1fr_auto']"),
			);
			expect(rows[0].textContent).toContain("Work (*Grammar)");
			expect(
				within(rows[0] as HTMLElement).getByTestId("curriculum-lesson-slot")
					.textContent,
			).toBe("Buổi 1 · Thứ Ba, 25/08 · 19:00–20:30");
			expect(
				within(rows[1] as HTMLElement).getByTestId("curriculum-lesson-slot")
					.textContent,
			).toBe("Buổi 2 · Thứ Sáu, 28/08 · 19:00–20:30");
			expect(
				within(rows[2] as HTMLElement).getByTestId("curriculum-lesson-slot")
					.textContent,
			).toBe("Buổi 3 · Thứ Ba, 01/09 · 19:00–20:30");
		});
	});

	it("reflects holiday skip, cancelled status, rescheduled time, and overflow unscheduled lessons", async () => {
		const snapshot = snapshotFixture({
			classes: [
				classRow({
					id: "cl-1",
					name: "IELTS Writing",
					syllabusId: "sy-c",
					schedule: SCHEDULE,
					startDate: "2026-08-25",
					sessionsTotal: 3,
				}),
			],
			students: [studentRow({ id: "st-1", name: "Học viên Một" })],
			enrollments: [
				enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
			],
			lessons: [
				lessonRow({
					id: "les-1",
					classId: "cl-1",
					enrollmentId: "en-1",
					sid: "st-1",
					date: "2026-08-26",
					day: 3,
					time: "18:00",
					dur: 120,
					status: "upcoming",
				} as never),
				lessonRow({
					id: "les-h",
					classId: "cl-1",
					enrollmentId: "en-1",
					sid: "st-1",
					date: "2026-08-28",
					day: 5,
					time: "19:00",
					dur: 90,
					status: "holiday",
				} as never),
				lessonRow({
					id: "les-2",
					classId: "cl-1",
					enrollmentId: "en-1",
					sid: "st-1",
					date: "2026-09-01",
					day: 2,
					time: "19:00",
					dur: 90,
					status: "upcoming",
				} as never),
				lessonRow({
					id: "les-3",
					classId: "cl-1",
					enrollmentId: "en-1",
					sid: "st-1",
					date: "2026-09-04",
					day: 5,
					time: "19:00",
					dur: 90,
					status: "cancelled",
				} as never),
			],
			syllabi: [
				syllabusRow({
					id: "sy-c",
					name: "Writing 7.0",
					classId: "cl-1",
					sourceTemplateId: "sy-t",
					totalLessons: 4,
					modules: [
						{
							id: "m-1",
							title: "Unit 1",
							description: "",
							lessons: [
								makeSyllabusLesson("l-1", "Bài 1"),
								makeSyllabusLesson("l-2", "Bài 2"),
								makeSyllabusLesson("l-3", "Bài 3"),
								makeSyllabusLesson("l-4", "Bài 4 (vượt lịch)"),
							],
						},
					],
				}),
			],
		});

		startKernelServer(snapshot);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(
			await screen.findByRole("button", { name: "Sắp xếp buổi" }),
		);
		const dialog = screen.getByRole("dialog", { name: "Quản lý buổi của lớp" });
		const slots = within(dialog)
			.getAllByTestId("curriculum-lesson-slot")
			.map((el) => el.textContent);

		expect(slots).toEqual([
			"Buổi 1 · Thứ Tư, 26/08 · 18:00–20:00",
			"Buổi 2 · Thứ Ba, 01/09 · 19:00–20:30",
			"Buổi 3 · Thứ Sáu, 04/09 · 19:00–20:30 · Đã hủy",
			"Buổi 4 · Chưa có lịch",
		]);
	});
});

describe("class detail → sync class curriculum (#700)", () => {
	const SCHEDULE = '{"days":[1,4],"start":"19:00","end":"20:30"}';
	const makeLesson = (id: string, title: string) => ({
		id,
		title,
		objectives: "",
		materials: "",
		kind: "lesson" as const,
		status: "upcoming" as const,
	});

	it("shows synced status with disabled Đồng bộ lại button and hides manage modal banner", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						syllabusId: "sy-c",
						schedule: SCHEDULE,
						sessionsTotal: 1,
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-t",
						name: "Template Gốc",
						totalLessons: 1,
						modules: [
							{
								id: "m-t",
								title: "Unit 1",
								description: "",
								lessons: [makeLesson("lt-1", "Line chart")],
							},
						],
					}),
					syllabusRow({
						id: "sy-c",
						name: "Template Gốc",
						classId: "cl-1",
						sourceTemplateId: "sy-t",
						totalLessons: 1,
						modules: [
							{
								id: "m-c",
								title: "Unit 1",
								description: "",
								lessons: [
									{
										...makeLesson("lc-1", "Line chart"),
										status: "done",
									},
								],
							},
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(await screen.findByRole("tab", { name: "Giáo trình" }));
		expect(screen.getByText("Đã đồng bộ với template gốc")).toBeTruthy();
		expect(
			(
				screen.getByRole("button", {
					name: "Đồng bộ lại",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Sắp xếp buổi" }));
		const dialog = screen.getByRole("dialog", { name: "Quản lý buổi của lớp" });
		expect(within(dialog).queryByTestId("manage-modal-sync-banner")).toBeNull();
	});

	it("shows out-of-sync indicator on Giáo trình tab and syncs via POST /curriculum/sync", async () => {
		const tplModules = [
			{
				id: "m-t",
				title: "Unit 1",
				description: "",
				lessons: [
					makeLesson("lt-1", "Line chart"),
					makeLesson("lt-2", "Bar chart"),
				],
			},
		];
		const server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						syllabusId: "sy-c",
						schedule: SCHEDULE,
						sessionsTotal: 1,
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-t",
						name: "Template Gốc",
						totalLessons: 2,
						modules: tplModules,
					}),
					syllabusRow({
						id: "sy-c",
						name: "Template Gốc",
						classId: "cl-1",
						sourceTemplateId: "sy-t",
						totalLessons: 1,
						modules: [
							{
								id: "m-c",
								title: "Unit 1",
								description: "",
								lessons: [makeLesson("lc-1", "Line chart")],
							},
						],
					}),
				],
			}),
			(req, srv) => {
				if (req.path === "/api/classes/cl-1/curriculum/sync") {
					const copy = srv.snapshot.syllabi.find((s) => s.id === "sy-c");
					if (copy) {
						copy.totalLessons = 2;
						copy.modules = structuredClone(tplModules);
					}
					srv.snapshot.classes[0] = {
						...srv.snapshot.classes[0],
						sessionsTotal: 2,
					};
				}
				return undefined;
			},
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(await screen.findByRole("tab", { name: "Giáo trình" }));
		expect(screen.getByText("Có thay đổi so với template gốc")).toBeTruthy();

		const syncBtn = screen.getByRole("button", {
			name: "Đồng bộ lại",
		}) as HTMLButtonElement;
		expect(syncBtn.disabled).toBe(false);
		fireEvent.click(syncBtn);

		const syncDialog = screen.getByRole("dialog", {
			name: "Đồng bộ lại giáo trình?",
		});
		expect(syncDialog.textContent).toContain("1 buổi → 2 buổi");
		expect(syncDialog.textContent).toContain(
			"Tổng số buổi dự kiến của lớp sẽ cập nhật thành 2 buổi.",
		);

		fireEvent.click(
			within(syncDialog).getByRole("button", { name: "Đồng bộ lại" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Đồng bộ lại giáo trình?" }),
			).toBeNull(),
		);
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/curriculum/sync",
				body: {},
			},
		]);
		expect(await screen.findByText("Đã đồng bộ với template gốc")).toBeTruthy();
	});

	it("shows out-of-sync banner inside Quản lý buổi của lớp and warns when class has real sessions", async () => {
		const server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						syllabusId: "sy-c",
						schedule: SCHEDULE,
						sessionsTotal: 1,
					}),
				],
				students: [studentRow({ id: "st-1", name: "Học viên Một" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
				],
				lessons: [
					lessonRow({
						id: "les-1",
						classId: "cl-1",
						enrollmentId: "en-1",
						date: "2026-08-25",
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-t",
						name: "Template Gốc",
						totalLessons: 2,
						modules: [
							{
								id: "m-t",
								title: "Unit 1",
								description: "",
								lessons: [
									makeLesson("lt-1", "Line chart"),
									makeLesson("lt-2", "Bar chart"),
								],
							},
						],
					}),
					syllabusRow({
						id: "sy-c",
						name: "Template Gốc",
						classId: "cl-1",
						sourceTemplateId: "sy-t",
						totalLessons: 1,
						modules: [
							{
								id: "m-c",
								title: "Unit 1",
								description: "",
								lessons: [makeLesson("lc-1", "Line chart")],
							},
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(
			await screen.findByRole("button", { name: "Sắp xếp buổi" }),
		);
		const manageDialog = screen.getByRole("dialog", {
			name: "Quản lý buổi của lớp",
		});
		const banner = within(manageDialog).getByTestId("manage-modal-sync-banner");
		expect(banner.textContent).toContain(
			'Template gốc "Template Gốc" đã có thay đổi so với giáo trình của lớp.',
		);

		fireEvent.click(
			within(banner).getByRole("button", { name: "Đồng bộ lại" }),
		);
		const syncDialog = screen.getByRole("dialog", {
			name: "Đồng bộ lại giáo trình?",
		});
		expect(syncDialog.textContent).toContain(
			"Lưu ý: Lớp đã có lịch buổi học thực tế (1 buổi) — lịch điểm danh và gói buổi của học viên vẫn giữ nguyên.",
		);

		fireEvent.click(
			within(syncDialog).getByRole("button", { name: "Đồng bộ lại" }),
		);
		await waitFor(() =>
			expect(server.writes).toEqual([
				{
					method: "POST",
					path: "/api/classes/cl-1/curriculum/sync",
					body: {},
				},
			]),
		);
	});

	it("offers fallback TemplatePicker when sourceTemplateId is missing or deleted", async () => {
		const server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						syllabusId: "sy-c",
						schedule: SCHEDULE,
						sessionsTotal: 1,
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-other",
						name: "Template Thay Thế",
						totalLessons: 2,
						modules: [
							{
								id: "m-o",
								title: "Unit 1",
								description: "",
								lessons: [
									makeLesson("lo-1", "Essay 1"),
									makeLesson("lo-2", "Essay 2"),
								],
							},
						],
					}),
					syllabusRow({
						id: "sy-c",
						name: "Bản cũ",
						classId: "cl-1",
						sourceTemplateId: "sy-deleted",
						totalLessons: 1,
						modules: [
							{
								id: "m-c",
								title: "Unit 1",
								description: "",
								lessons: [makeLesson("lc-1", "Line chart")],
							},
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(await screen.findByRole("tab", { name: "Giáo trình" }));
		expect(screen.getByText("Template gốc đã bị xóa")).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: "Đồng bộ từ template khác" }),
		);
		const syncDialog = screen.getByRole("dialog", {
			name: "Đồng bộ giáo trình từ template khác",
		});
		expect(
			within(syncDialog).getByRole("option", {
				name: "Template Thay Thế · 2 buổi",
			}),
		).toBeTruthy();

		fireEvent.click(
			within(syncDialog).getByRole("button", { name: "Đồng bộ giáo trình" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", {
					name: "Đồng bộ giáo trình từ template khác",
				}),
			).toBeNull(),
		);
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/curriculum/sync",
				body: { templateId: "sy-other" },
			},
		]);
	});

	it("shows missing-source-template banner inside Quản lý buổi của lớp and opens TemplatePicker sync modal", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						syllabusId: "sy-c",
						schedule: SCHEDULE,
						sessionsTotal: 1,
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-other",
						name: "Template Thay Thế",
						totalLessons: 2,
						modules: [
							{
								id: "m-o",
								title: "Unit Other",
								description: "",
								lessons: [
									makeLesson("lo-1", "Task 1"),
									makeLesson("lo-2", "Task 2"),
								],
							},
						],
					}),
					syllabusRow({
						id: "sy-c",
						name: "Bản cũ",
						classId: "cl-1",
						sourceTemplateId: "sy-deleted",
						totalLessons: 1,
						modules: [
							{
								id: "m-c",
								title: "Unit 1",
								description: "",
								lessons: [makeLesson("lc-1", "Line chart")],
							},
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(
			await screen.findByRole("button", { name: "Sắp xếp buổi" }),
		);
		const dialog = screen.getByRole("dialog", { name: "Quản lý buổi của lớp" });
		const banner = within(dialog).getByTestId("manage-modal-sync-banner");
		expect(banner.textContent).toContain("Template gốc đã bị xóa");

		fireEvent.click(
			within(banner).getByRole("button", { name: "Đồng bộ từ template khác" }),
		);
		expect(
			screen.getByRole("dialog", {
				name: "Đồng bộ giáo trình từ template khác",
			}),
		).toBeTruthy();
	});

	it("renders SyncCurriculumModal as sibling dialog, respects Escape stack and saving guard", async () => {
		let resolveWrite: (() => void) | undefined;
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						syllabusId: "sy-c",
						schedule: SCHEDULE,
						sessionsTotal: 1,
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-t",
						name: "Template Gốc",
						totalLessons: 2,
						modules: [
							{
								id: "m-t",
								title: "Unit 1",
								description: "",
								lessons: [
									makeLesson("lt-1", "Task 1"),
									makeLesson("lt-2", "Task 2"),
								],
							},
						],
					}),
					syllabusRow({
						id: "sy-c",
						name: "Template Gốc",
						classId: "cl-1",
						sourceTemplateId: "sy-t",
						totalLessons: 1,
						modules: [
							{
								id: "m-c",
								title: "Unit 1",
								description: "",
								lessons: [makeLesson("lc-1", "Line chart")],
							},
						],
					}),
				],
			}),
			() =>
				new Promise((resolve) => {
					resolveWrite = () => resolve(undefined);
				}),
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(
			await screen.findByRole("button", { name: "Sắp xếp buổi" }),
		);
		const manageDialog = screen.getByRole("dialog", {
			name: "Quản lý buổi của lớp",
		});
		const banner = within(manageDialog).getByTestId("manage-modal-sync-banner");
		fireEvent.click(
			within(banner).getByRole("button", { name: "Đồng bộ lại" }),
		);

		const syncDialog = screen.getByRole("dialog", {
			name: "Đồng bộ lại giáo trình?",
		});
		// Sibling dialog — không lồng trong manageDialog.
		expect(manageDialog.contains(syncDialog)).toBe(false);

		// Đóng bằng Escape chỉ đóng syncDialog, giữ manageDialog mở.
		fireEvent.keyDown(document, { key: "Escape" });
		expect(
			screen.queryByRole("dialog", { name: "Đồng bộ lại giáo trình?" }),
		).toBeNull();
		expect(
			screen.getByRole("dialog", { name: "Quản lý buổi của lớp" }),
		).toBeTruthy();

		// Mở lại và nhấn submit để vào trạng thái saving: Escape không được đóng cả 2 dialog.
		fireEvent.click(
			within(banner).getByRole("button", { name: "Đồng bộ lại" }),
		);
		const syncDialog2 = screen.getByRole("dialog", {
			name: "Đồng bộ lại giáo trình?",
		});
		fireEvent.click(
			within(syncDialog2).getByRole("button", { name: "Đồng bộ lại" }),
		);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(
			screen.getByRole("dialog", { name: "Đồng bộ lại giáo trình?" }),
		).toBeTruthy();
		expect(
			screen.getByRole("dialog", { name: "Quản lý buổi của lớp" }),
		).toBeTruthy();

		resolveWrite?.();
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Đồng bộ lại giáo trình?" }),
			).toBeNull(),
		);
		expect(
			screen.getByRole("dialog", { name: "Quản lý buổi của lớp" }),
		).toBeTruthy();

		// Escape lần nữa đóng nốt manageDialog.
		fireEvent.keyDown(document, { key: "Escape" });
		expect(
			screen.queryByRole("dialog", { name: "Quản lý buổi của lớp" }),
		).toBeNull();
	});

	it("allows opening TemplatePicker modal with empty explanation when 0 templates remain", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						syllabusId: "sy-c",
						schedule: SCHEDULE,
						sessionsTotal: 1,
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-c",
						name: "Bản mồ côi",
						classId: "cl-1",
						sourceTemplateId: "sy-deleted",
						totalLessons: 1,
						modules: [
							{
								id: "m-c",
								title: "Unit 1",
								description: "",
								lessons: [makeLesson("lc-1", "Line chart")],
							},
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(await screen.findByRole("tab", { name: "Giáo trình" }));
		const openBtn = screen.getByRole("button", {
			name: "Đồng bộ từ template khác",
		}) as HTMLButtonElement;
		expect(openBtn.disabled).toBe(false);
		fireEvent.click(openBtn);

		const syncDialog = screen.getByRole("dialog", {
			name: "Đồng bộ giáo trình từ template khác",
		});
		expect(syncDialog.textContent).toContain(
			"Chưa có template nào — tạo syllabus ở trang Syllabus trước.",
		);
		expect(
			(
				within(syncDialog).getByRole("button", {
					name: "Đồng bộ giáo trình",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});
});

describe("class detail → pause and resume class status (#694)", () => {
	it("shows Đang hoạt động badge (not Đang học in PageHead) and toggles active ↔ paused via ClassStatusModal", async () => {
		const snapshot = twoClasses();
		const server = startKernelServer(snapshot, (req, srv) => {
			if (req.method === "POST" && req.path === "/api/classes/cl-1/status") {
				const body = req.body as { status: "active" | "paused" };
				const target = srv.snapshot.classes.find((c) => c.id === "cl-1");
				if (target) target.status = body.status;
				return { status: 200, body: { ok: true, status: body.status } };
			}
			return undefined;
		});
		renderWithKernel(<ClassDetail />);

		const badge = await screen.findByTestId("class-status-badge");
		expect(badge.textContent).toBe("Đang hoạt động");

		fireEvent.click(screen.getByRole("button", { name: "Tạm dừng lớp" }));
		const pauseDialog = screen.getByRole("dialog", {
			name: "Tạm dừng lớp IELTS Writing",
		});
		const confirmPause = within(pauseDialog).getByRole("button", {
			name: "Xác nhận tạm dừng",
		});
		expect(confirmPause.getAttribute("class") ?? "").not.toContain(
			"destructive",
		);
		fireEvent.click(confirmPause);

		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Tạm dừng lớp IELTS Writing" }),
			).toBeNull(),
		);
		expect(server.writes).toContainEqual({
			method: "POST",
			path: "/api/classes/cl-1/status",
			body: { status: "paused" },
		});
		expect(screen.getByTestId("class-status-badge").textContent).toBe(
			"Tạm dừng",
		);
		expect(screen.getByRole("button", { name: "Mở lại lớp" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Mở lại lớp" }));
		const resumeDialog = screen.getByRole("dialog", {
			name: "Mở lại lớp IELTS Writing",
		});
		fireEvent.click(
			within(resumeDialog).getByRole("button", { name: "Xác nhận mở lại" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Mở lại lớp IELTS Writing" }),
			).toBeNull(),
		);
		expect(server.writes).toContainEqual({
			method: "POST",
			path: "/api/classes/cl-1/status",
			body: { status: "active" },
		});
		expect(screen.getByTestId("class-status-badge").textContent).toBe(
			"Đang hoạt động",
		);
	});

	it("hides Tạm dừng lớp / Mở lại lớp button for ta role while keeping it for teacher", async () => {
		startKernelServer({
			...twoClasses(),
			viewer: {
				role: "ta",
				canAccessFinance: false,
			},
		});
		renderWithKernel(<ClassDetail />);

		expect(await screen.findByTestId("class-status-badge")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Tạm dừng lớp" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Mở lại lớp" })).toBeNull();
	});

	it("hides + Thêm buổi học and + Thêm học viên vào lớp when paused, but keeps Sửa and Sắp xếp buổi", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						status: "paused",
						syllabusId: null,
						sessionsTotal: 0,
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		expect(await screen.findByTestId("class-status-badge")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Chỉnh sửa" })).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "+ Thêm buổi học" }),
		).toBeNull();

		fireEvent.click(screen.getByRole("tab", { name: "Học viên" }));
		expect(
			screen.queryByRole("button", { name: "+ Thêm học viên vào lớp" }),
		).toBeNull();
	});

	it("keeps Sắp xếp buổi available when syllabus-backed class is paused", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						status: "paused",
						syllabusId: "sy-c",
						schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
						startDate: "2026-10-12",
						sessionsTotal: 2,
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-c",
						classId: "cl-1",
						modules: [
							{
								id: "m-1",
								title: "Unit 1",
								description: "",
								lessons: [
									{
										id: "lc-1",
										title: "Line chart",
										objectives: "",
										materials: "",
										kind: "lesson" as const,
										status: "upcoming" as const,
									},
								],
							},
						],
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		fireEvent.click(
			await screen.findByRole("tab", { name: "Buổi học & luyện tập" }),
		);
		expect(screen.getByRole("button", { name: "Sắp xếp buổi" })).toBeTruthy();
	});

	it("keeps Nhập buổi từ syllabus available when a paused class has no syllabus and zero sessions", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						status: "paused",
						syllabusId: null,
						schedulingMode: "manual",
						sessionsTotal: 0,
						schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
						startDate: "2026-08-24",
					}),
				],
				syllabi: [
					syllabusRow({
						id: "sy-tpl",
						name: "IELTS Template",
						classId: null,
					}),
				],
			}),
		);
		renderWithKernel(<ClassDetail />);

		expect(
			await screen.findByRole("button", { name: "Nhập buổi từ syllabus" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "+ Thêm buổi học" }),
		).toBeNull();
	});

	it("closes EnrollStudentModal when the class transitions to paused and keeps it closed on resume", async () => {
		startKernelServer(twoClasses(), (req, srv) => {
			if (req.path === "/api/classes/cl-1/status") {
				const next = (req.body as { status: "active" | "paused" }).status;
				srv.snapshot.classes[0] = {
					...srv.snapshot.classes[0],
					status: next,
				};
			}
			return undefined;
		});

		function StatusDriver() {
			const { dispatch } = useData();
			return (
				<div>
					<button
						type="button"
						data-testid="driver-pause"
						onClick={() => {
							void dispatch({
								type: "update-class-status",
								classId: "cl-1",
								status: "paused",
							});
						}}
					>
						driver-pause
					</button>
					<button
						type="button"
						data-testid="driver-resume"
						onClick={() => {
							void dispatch({
								type: "update-class-status",
								classId: "cl-1",
								status: "active",
							});
						}}
					>
						driver-resume
					</button>
				</div>
			);
		}

		renderWithKernel(
			<>
				<ClassDetail />
				<StatusDriver />
			</>,
		);

		const dialog = await openEnrollDialog();
		expect(dialog).toBeTruthy();

		fireEvent.click(screen.getByTestId("driver-pause"));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		fireEvent.click(screen.getByTestId("driver-resume"));
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "+ Thêm học viên vào lớp" }),
			).toBeTruthy(),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
