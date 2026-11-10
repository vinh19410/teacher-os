// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
	type KernelServer,
	lessonRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
	syllabusRow,
	type WriteHandler,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
const toast = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import { Route } from "./$classId";

const ClassDetail = (Route as unknown as { component: () => React.ReactNode })
	.component;

// Monday 12/10/2026, 10:00 Vietnam time. The class meets Mondays.
const MONDAY = new Date("2026-10-12T03:00:00Z");
const TODAY = "2026-10-12";
const NEXT_WEEK = "2026-10-19";

/** Class with dated Monday sessions today and next week; one row per
 * enrolled student per session (the kernel's slot bag). */
function mondayClass(studentIds: string[]) {
	const lessons = studentIds.flatMap((sid, n) =>
		[TODAY, NEXT_WEEK].map((date) =>
			lessonRow({
				id: `les-${sid}-${date}`,
				enrollmentId: `en-${n}`,
				day: 1,
				date,
				type: studentIds.length > 1 ? "1:2" : "1:1",
				topic: "Line chart",
			}),
		),
	);
	return snapshotFixture({
		classes: [
			classRow({
				id: "cl-1",
				name: "IELTS Writing",
				schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
				startDate: TODAY,
				sessionsTotal: 2,
				syllabusId: "sy-c",
				notes: "ghi chú cũ",
			}),
		],
		syllabi: [
			syllabusRow({
				id: "sy-c",
				name: "Writing (bản lớp)",
				classId: "cl-1",
				sourceTemplateId: "sy-t",
			}),
		],
		students: studentIds.map((id, n) =>
			studentRow({ id, name: `Học viên ${n + 1}` }),
		),
		enrollments: studentIds.map((sid, n) =>
			enrollmentRow({ id: `en-${n}`, studentId: sid }),
		),
		lessons,
	});
}

/** Holds every write until `land()` — to observe the in-flight UI. */
function heldWrites(): { handler: WriteHandler; land: () => void } {
	let release: () => void = () => {};
	return {
		handler: () =>
			new Promise((resolve) => {
				release = () => resolve(undefined);
			}),
		land: () => release(),
	};
}

let server: KernelServer;

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(MONDAY);
	resetRouterState();
	routerState.params = { classId: "cl-1" };
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

async function openSessionsTab() {
	renderWithKernel(<ClassDetail />);
	fireEvent.click(
		await screen.findByRole("tab", { name: "Buổi học & luyện tập" }),
	);
}

function sessionRow(dateLabel: string): HTMLElement {
	const rows = screen
		.getAllByTestId("session-row")
		.filter((row) => row.textContent?.includes(dateLabel));
	if (rows.length !== 1) {
		throw new Error(
			`Expected exactly 1 session-row containing "${dateLabel}", found ${rows.length}`,
		);
	}
	return rows[0];
}

describe("1:1 class — in-place check-in", () => {
	it("checks today's session in with one POST of that session's lesson", async () => {
		server = startKernelServer(mondayClass(["st-1"]));
		await openSessionsTab();
		fireEvent.click(
			within(sessionRow("12/10")).getByRole("button", { name: "Điểm danh" }),
		);
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã điểm danh."),
		);
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: `/api/lessons/les-st-1-${TODAY}/check-in`,
				body: {},
			},
		]);
	});

	it("offers no check-in for a session that has not happened yet", async () => {
		server = startKernelServer(mondayClass(["st-1"]));
		await openSessionsTab();
		expect(
			within(sessionRow("19/10")).queryByRole("button", { name: "Điểm danh" }),
		).toBeNull();
	});

	it("locks the other class actions while a check-in is saving", async () => {
		const held = heldWrites();
		server = startKernelServer(mondayClass(["st-1"]), held.handler);
		await openSessionsTab();
		fireEvent.click(
			within(sessionRow("12/10")).getByRole("button", { name: "Điểm danh" }),
		);
		const saving = await within(sessionRow("12/10")).findByRole("button", {
			name: "Đang lưu…",
		});
		expect((saving as HTMLButtonElement).disabled).toBe(true);
		expect(
			(
				within(sessionRow("19/10")).getByRole("button", {
					name: "Điều chỉnh",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		// #391: "Gỡ giáo trình" sống ở tab "Giáo trình" — busy khoá toàn trang.
		fireEvent.click(screen.getByRole("tab", { name: "Giáo trình" }));
		expect(
			(
				(await screen.findByRole("button", {
					name: "Gỡ giáo trình",
				})) as HTMLButtonElement
			).disabled,
		).toBe(true);
		held.land();
		await waitFor(() => expect(toast.success).toHaveBeenCalled());
		expect(server.writes).toHaveLength(1);
	});
});

describe("one action at a time across the class page", () => {
	it("blocks check-in while the curriculum removal is still saving", async () => {
		const held = heldWrites();
		server = startKernelServer(mondayClass(["st-1"]), held.handler);
		renderWithKernel(<ClassDetail />);
		// #391: "Gỡ giáo trình" sống ở tab "Giáo trình".
		fireEvent.click(await screen.findByRole("tab", { name: "Giáo trình" }));
		fireEvent.click(screen.getByRole("button", { name: "Gỡ giáo trình" }));
		fireEvent.click(
			within(screen.getByRole("dialog")).getByRole("button", {
				name: "Gỡ giáo trình",
			}),
		);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		fireEvent.click(
			await screen.findByRole("tab", { name: "Buổi học & luyện tập" }),
		);

		const checkIn = within(sessionRow("12/10")).getByRole("button", {
			name: "Điểm danh",
		}) as HTMLButtonElement;
		expect(checkIn.disabled).toBe(true);
		fireEvent.click(checkIn);
		held.land();
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã gỡ giáo trình."),
		);
		expect(server.writes).toHaveLength(1);
	});
});

describe("group class — attendance roster", () => {
	it("exposes a stable per-session testid that opens the roster modal", async () => {
		server = startKernelServer(mondayClass(["st-1", "st-2"]));
		await openSessionsTab();
		// #403: harness design:compare click modal qua testid này — selector
		// phải khớp appSteps của t-attendance trong
		// scripts/design-compare/screens.json (buổi TODAY = index 1 fixture).
		fireEvent.click(
			within(sessionRow("12/10")).getByTestId("session-attendance-open-1"),
		);
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("checks in the chosen student only", async () => {
		server = startKernelServer(mondayClass(["st-1", "st-2"]));
		await openSessionsTab();
		fireEvent.click(
			within(sessionRow("12/10")).getByRole("button", {
				name: "Điểm danh →",
			}),
		);
		const roster = screen.getByRole("dialog");
		const second = within(roster)
			.getByText("Học viên 2")
			.closest("li, div") as HTMLElement;
		fireEvent.click(within(second).getByRole("button", { name: "Điểm danh" }));
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].path).toBe(
			`/api/lessons/les-st-2-${TODAY}/check-in`,
		);
	});
});

describe("Điều chỉnh buổi (whole-class occurrence)", () => {
	async function openAdjust(dateLabel: string) {
		fireEvent.click(
			within(sessionRow(dateLabel)).getByRole("button", { name: "Điều chỉnh" }),
		);
		return screen.getByRole("dialog");
	}

	it("only lets a session be completed once it has happened", async () => {
		server = startKernelServer(mondayClass(["st-1", "st-2"]));
		await openSessionsTab();
		const dialog = await openAdjust("19/10");
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Hoàn thành buổi",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(dialog.textContent).toContain("Buổi diễn ra sau hôm nay");
	});

	it("cancels the whole session after a confirmation that names everyone affected", async () => {
		server = startKernelServer(mondayClass(["st-1", "st-2"]));
		await openSessionsTab();
		const dialog = await openAdjust("19/10");
		fireEvent.click(within(dialog).getByRole("button", { name: "Hủy buổi" }));
		expect(server.writes).toEqual([]);

		const confirm = within(dialog).getByRole("alertdialog");
		expect(confirm.textContent).toContain("2 học viên sẽ bị hủy");
		expect(confirm.textContent).toContain("Học viên 1");
		expect(confirm.textContent).toContain("Học viên 2");
		fireEvent.click(within(confirm).getByRole("button", { name: "Xác nhận" }));

		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0]).toMatchObject({
			method: "POST",
			path: `/api/classes/cl-1/sessions/${NEXT_WEEK}/cancel`,
		});
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith(
				expect.stringContaining("Đã hủy buổi."),
			),
		);
	});

	it("completes today's session for the class after confirmation", async () => {
		server = startKernelServer(mondayClass(["st-1", "st-2"]));
		await openSessionsTab();
		const dialog = await openAdjust("12/10");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Hoàn thành buổi" }),
		);
		fireEvent.click(
			within(within(dialog).getByRole("alertdialog")).getByRole("button", {
				name: "Xác nhận",
			}),
		);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].path).toBe(
			`/api/classes/cl-1/sessions/${TODAY}/check-in`,
		);
	});

	it("saves an edited topic for the occurrence of the clicked date", async () => {
		server = startKernelServer(mondayClass(["st-1", "st-2"]));
		await openSessionsTab();
		const dialog = await openAdjust("19/10");
		fireEvent.change(within(dialog).getByLabelText("Chủ đề"), {
			target: { value: "Bar chart" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0]).toMatchObject({
			path: `/api/classes/cl-1/sessions/${NEXT_WEEK}/edit`,
			body: { topic: "Bar chart" },
		});
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith(
				expect.stringContaining("Đã cập nhật buổi."),
			),
		);
	});

	it("says so instead of writing when nothing was changed", async () => {
		server = startKernelServer(mondayClass(["st-1", "st-2"]));
		await openSessionsTab();
		const dialog = await openAdjust("19/10");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		expect(
			within(dialog).getByText("Chưa có thay đổi nào để lưu."),
		).toBeTruthy();
		expect(server.writes).toEqual([]);
	});
});

describe("class notes", () => {
	it("saves the typed notes and blocks a second save while the first is in flight", async () => {
		const held = heldWrites();
		server = startKernelServer(mondayClass(["st-1"]), held.handler);
		renderWithKernel(<ClassDetail />);
		fireEvent.click(await screen.findByRole("tab", { name: "Ghi chú" }));
		fireEvent.change(screen.getByDisplayValue("ghi chú cũ"), {
			target: { value: "Nhắc học viên mang đề" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));
		const saving = await screen.findByRole("button", { name: "Đang lưu…" });
		expect((saving as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(saving);

		held.land();
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã lưu ghi chú."),
		);
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/notes",
				body: { notes: "Nhắc học viên mang đề" },
			},
		]);
	});
});

describe("session materials", () => {
	const BANK = [
		{
			id: "m-1",
			folderId: null,
			title: "Đề Writing Task 1",
			description: "",
			kind: "file",
			url: null,
			mimeType: "application/pdf",
			sizeBytes: 2048,
			originalName: "de.pdf",
			usageCount: 1,
			createdAt: "2026-10-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
		},
		{
			id: "m-2",
			folderId: null,
			title: "Bài đọc BBC",
			description: "",
			kind: "link",
			url: "https://www.bbc.co.uk/learning",
			mimeType: null,
			sizeBytes: null,
			originalName: null,
			usageCount: 0,
			createdAt: "2026-10-01T00:00:00.000Z",
			updatedAt: "2026-10-01T00:00:00.000Z",
		},
	];
	const SESSION_PATH = `/api/classes/cl-1/sessions/${NEXT_WEEK}/materials`;

	/** Stateful fake of the material routes: `attached` holds the session's ids. */
	function materialsHandler(attached: string[]): WriteHandler {
		return (req) => {
			const path = req.path.split("?")[0];
			if (req.method === "GET" && path === SESSION_PATH) {
				return {
					status: 200,
					body: {
						items: BANK.filter((m) => attached.includes(m.id)).map(
							(m, position) => ({
								...m,
								position,
								attachedAt: "2026-10-02T00:00:00.000Z",
							}),
						),
					},
				};
			}
			if (req.method === "GET" && path === "/api/materials/folders") {
				return { status: 200, body: { folders: [] } };
			}
			if (req.method === "GET" && path === "/api/materials") {
				return { status: 200, body: { items: BANK } };
			}
			if (req.method === "POST" && path === SESSION_PATH) {
				const { materialId } = req.body as { materialId: string };
				attached.push(materialId);
				return {
					status: 201,
					body: { item: { ...BANK.find((m) => m.id === materialId) } },
				};
			}
			if (req.method === "DELETE" && path.startsWith(`${SESSION_PATH}/`)) {
				const id = path.slice(SESSION_PATH.length + 1);
				attached.splice(attached.indexOf(id), 1);
				return { status: 200, body: { ok: true } };
			}
			return undefined;
		};
	}

	async function openMaterials(dateLabel: string) {
		fireEvent.click(
			within(sessionRow(dateLabel)).getByRole("button", {
				name: /^Tài liệu buổi/,
			}),
		);
		return screen.findByRole("dialog", { name: /^Tài liệu buổi/ });
	}

	it("lists the attached materials of a dated session and detaches one", async () => {
		server = startKernelServer(
			mondayClass(["st-1"]),
			materialsHandler(["m-1"]),
		);
		await openSessionsTab();
		const dialog = await openMaterials("19/10");
		expect(await within(dialog).findByText("Đề Writing Task 1")).toBeTruthy();
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Gỡ Đề Writing Task 1" }),
		);
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith(
				"Đã gỡ tài liệu khỏi buổi học.",
			),
		);
		expect(
			server.writes.some(
				(w) => w.method === "DELETE" && w.path === `${SESSION_PATH}/m-1`,
			),
		).toBe(true);
		expect(
			await within(dialog).findByTestId("session-materials-empty"),
		).toBeTruthy();
	});

	it("attaches from the bank and disables materials already attached", async () => {
		server = startKernelServer(
			mondayClass(["st-1"]),
			materialsHandler(["m-1"]),
		);
		await openSessionsTab();
		const dialog = await openMaterials("19/10");
		await within(dialog).findByText("Đề Writing Task 1");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Chọn từ ngân hàng" }),
		);
		const picker = await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		const attached = await within(picker).findByRole("button", {
			name: "Đã gắn Đề Writing Task 1",
		});
		expect((attached as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(
			within(picker).getByRole("button", { name: "Gắn Bài đọc BBC" }),
		);
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith(
				"Đã gắn tài liệu vào buổi học.",
			),
		);
		expect(
			server.writes.find((w) => w.method === "POST" && w.path === SESSION_PATH)
				?.body,
		).toEqual({ materialId: "m-2" });
		expect(
			await within(picker).findByRole("button", {
				name: "Đã gắn Bài đọc BBC",
			}),
		).toBeTruthy();
	});

	it("blocks an unsupported session upload before sending anything", async () => {
		server = startKernelServer(mondayClass(["st-1"]), materialsHandler([]));
		await openSessionsTab();
		const dialog = await openMaterials("19/10");
		await within(dialog).findByTestId("session-materials-empty");
		fireEvent.change(
			within(dialog).getByLabelText("Chọn file tải lên cho buổi học"),
			{
				target: {
					files: [
						new File(["x"], "virus.exe", { type: "application/x-msdownload" }),
					],
				},
			},
		);
		expect((await within(dialog).findByRole("alert")).textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);
		expect(server.writes.some((w) => w.method === "PUT")).toBe(false);
	});

	it("hides session materials for a legacy class without dated sessions", async () => {
		const snapshot = mondayClass(["st-1"]);
		snapshot.lessons = snapshot.lessons.map((l) => ({ ...l, date: null }));
		server = startKernelServer(snapshot);
		await openSessionsTab();
		expect(
			screen.queryAllByRole("button", { name: /^Tài liệu buổi/ }),
		).toHaveLength(0);
		expect(
			screen.getByText(
				/Tài liệu theo buổi chỉ dùng được cho lớp có lịch theo ngày/,
			),
		).toBeTruthy();
	});

	it("hides the materials button on a holiday session row (#645)", async () => {
		const snapshot = mondayClass(["st-1"]);
		snapshot.lessons = snapshot.lessons.map((l) =>
			l.date === TODAY ? { ...l, status: "holiday" as const } : l,
		);
		server = startKernelServer(snapshot);
		await openSessionsTab();
		// Buổi holiday vô hình với học sinh — không mở được modal tài liệu.
		expect(
			within(sessionRow("12/10")).queryByRole("button", {
				name: /^Tài liệu buổi/,
			}),
		).toBeNull();
		// Row thường giữ nguyên nút.
		expect(
			within(sessionRow("19/10")).getByRole("button", {
				name: /^Tài liệu buổi/,
			}),
		).toBeTruthy();
	});
});

describe("manual 0-lesson bucket với holiday shift — badge Đã dời (#665)", () => {
	/** Lớp manual 2 buổi (hôm nay + tuần sau), không enrollment → bucket 0 lesson. */
	function manualShiftedClass(
		overrides: Partial<Parameters<typeof snapshotFixture>[0]> = {},
	) {
		return snapshotFixture({
			classes: [
				classRow({
					id: "cl-1",
					name: "IELTS Writing",
					schedulingMode: "manual",
					// days 0-6 Mon-first (parseStoredSchedule) — [0] = Thứ 2.
					schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
					startDate: TODAY,
					sessionsTotal: 2,
					syllabusId: "sy-c",
				}),
			],
			syllabi: [
				syllabusRow({
					id: "sy-c",
					name: "Writing (bản lớp)",
					classId: "cl-1",
					sourceTemplateId: "sy-t",
				}),
			],
			classSessions: [
				{
					id: "cs-1",
					classId: "cl-1",
					date: TODAY,
					time: "19:00",
					dur: 90,
					topic: "",
					zoom: "",
				},
				{
					id: "cs-2",
					classId: "cl-1",
					date: NEXT_WEEK,
					time: "19:00",
					dur: 90,
					topic: "",
					zoom: "",
				},
			],
			students: [],
			enrollments: [],
			lessons: [],
			holidayShifts: [
				{ classId: "cl-1", originalDate: TODAY, makeupDate: "2026-12-21" },
			],
			...overrides,
		});
	}

	it("hiển thị badge Đã dời cho bucket 0 lesson có shift trùng ngày, vắng «Sắp tới»", async () => {
		server = startKernelServer(manualShiftedClass());
		await openSessionsTab();
		const row = sessionRow("12/10");
		expect(within(row).getByText("Nghỉ lễ — Đã dời lịch")).toBeTruthy();
		expect(within(row).queryByText("Sắp tới")).toBeNull();
		// Bucket không shift giữ nguyên hành vi «Sắp tới».
		expect(within(sessionRow("19/10")).getByText("Sắp tới")).toBeTruthy();
	});

	it("giữ badge cũ qua status holiday khi bucket có lesson row holiday", async () => {
		server = startKernelServer(
			manualShiftedClass({
				students: [studentRow({ id: "st-1", name: "Học viên 1" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
				],
				lessons: [
					lessonRow({
						id: "les-hol",
						enrollmentId: "en-1",
						day: 1,
						date: TODAY,
						status: "holiday",
					}),
				],
			}),
		);
		await openSessionsTab();
		// Đúng 1 badge — không double-badge với nhánh flagged mới.
		expect(
			within(sessionRow("12/10")).getAllByText("Nghỉ lễ — Đã dời lịch"),
		).toHaveLength(1);
	});

	it("lớp auto giữ «Dự kiến» — flag không lộ qua projection", async () => {
		server = startKernelServer(
			manualShiftedClass({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						// days 0-6 Mon-first — [0] = Thứ 2, khớp startDate thứ Hai.
						schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
						startDate: TODAY,
						sessionsTotal: 2,
					}),
				],
				classSessions: undefined,
			}),
		);
		await openSessionsTab();
		const row = sessionRow("12/10");
		expect(within(row).getByText("Dự kiến")).toBeTruthy();
		expect(within(row).queryByText("Nghỉ lễ — Đã dời lịch")).toBeNull();
	});

	it("shift của lớp khác không badge chéo (filter classId)", async () => {
		server = startKernelServer(
			manualShiftedClass({
				holidayShifts: [
					{ classId: "cl-2", originalDate: TODAY, makeupDate: "2026-12-21" },
				],
			}),
		);
		await openSessionsTab();
		const row = sessionRow("12/10");
		expect(within(row).getByText("Sắp tới")).toBeTruthy();
		expect(within(row).queryByText("Nghỉ lễ — Đã dời lịch")).toBeNull();
	});

	it("thiếu holidayShifts (deploy skew server cũ) giữ «Sắp tới»", async () => {
		server = startKernelServer(
			manualShiftedClass({ holidayShifts: undefined }),
		);
		await openSessionsTab();
		const row = sessionRow("12/10");
		expect(within(row).getByText("Sắp tới")).toBeTruthy();
		expect(within(row).queryByText("Nghỉ lễ — Đã dời lịch")).toBeNull();
	});
});
