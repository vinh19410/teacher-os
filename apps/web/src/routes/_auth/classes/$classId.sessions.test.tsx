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
		await screen.findByRole("tab", { name: "Sessions & practice" }),
	);
}

function sessionRow(dateLabel: string): HTMLElement {
	return screen
		.getByText(new RegExp(dateLabel))
		.closest("[data-testid='session-row']") as HTMLElement;
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
			await screen.findByRole("tab", { name: "Sessions & practice" }),
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
