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
		const dialog = screen
			.getAllByRole("dialog")
			.find((d) => d.textContent?.includes("Thêm buổi học")) as HTMLElement;
		expect(within(dialog).queryByLabelText("Loại buổi học")).toBeNull();
		expect(within(dialog).getByLabelText("Trạng thái")).toBeTruthy();
	});
});
