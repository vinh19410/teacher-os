// @vitest-environment jsdom

import { useQueryClient } from "@tanstack/react-query";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
	invoiceRow,
	type KernelServer,
	lessonRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { Route } from "./dashboard";

const Dashboard = (Route as unknown as { component: () => React.ReactNode })
	.component;

// Wednesday (lesson day 3) mid-morning in Vietnam timezone.
const WEDNESDAY = new Date("2026-10-07T10:00:00+07:00");

/** Body reminders mặc định khớp ngày Wednesday (07/10/2026) của fake timer. */
const REMINDERS_BODY = {
	date: "2026-10-07",
	attendance: {
		pending: 1,
		items: [
			{
				classId: "cl-1",
				className: "IELTS Writing tối",
				time: "19:00",
				dur: 90,
			},
		],
	},
	overdueGrading: { count: 2, writing: 1, speaking: 1 },
	tuition: { students: 3, outstanding: 1_500_000 },
};

let remindersLoads = 0;

/** startKernelServer + trả reply reminders cho /api/dashboard/reminders
 * (mọi GET không phải snapshot rơi vào onWrite). */
function startRemindersServer(
	snapshot: KernelSnapshot,
	remindersBody: unknown = REMINDERS_BODY,
	remindersStatus = 200,
): KernelServer {
	remindersLoads = 0;
	return startKernelServer(snapshot, (req) => {
		if (
			req.method === "GET" &&
			req.path.startsWith("/api/dashboard/reminders")
		) {
			remindersLoads += 1;
			return { status: remindersStatus, body: remindersBody };
		}
		return undefined;
	});
}

/** Nút probe mô phỏng đúng cơ chế refresh sau action kernel:
 * refetchQueries exact:true trên ["kernel"] (data-provider.tsx). */
function KernelRefreshProbe() {
	const client = useQueryClient();
	return (
		<button
			type="button"
			onClick={() =>
				void client.refetchQueries({
					queryKey: ["kernel"],
					exact: true,
					type: "all",
				})
			}
		>
			probe-refresh-kernel
		</button>
	);
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(WEDNESDAY);
	resetRouterState();
	routerState.routeContext = {
		session: { data: { user: { name: "Cô Hạnh", email: "h@example.com" } } },
	};
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function section(heading: string): HTMLElement {
	return screen
		.getByRole("heading", { name: heading })
		.closest("section, [data-testid='dashboard-risk-card']") as HTMLElement;
}

describe("dashboard", () => {
	it("lists today's class sessions as read-only timeline with status pills, shows Hero summary with buổi dạy, and shows Toàn trung tâm stats", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "IELTS Writing tối", mode: "Online" }),
					classRow({ id: "cl-2", name: "Lớp đã hủy" }),
				],
				students: [studentRow({ id: "st-1" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1" }),
					enrollmentRow({ id: "en-2", classId: "cl-2" }),
				],
				lessons: [
					lessonRow({
						id: "a",
						day: 3,
						time: "19:00",
						topic: "Line chart",
						status: "upcoming",
					}),
					lessonRow({
						id: "b",
						classId: "cl-2",
						enrollmentId: "en-2",
						day: 3,
						time: "08:00",
						status: "cancelled",
					}),
					lessonRow({ id: "c", day: 5, time: "18:00", topic: "Bar chart" }),
					// Past session (08:00–09:30 < 10:00) without topic and completed — shows "Đã điểm danh" pill.
					lessonRow({
						id: "d",
						day: 3,
						time: "08:00",
						topic: "",
						status: "completed",
					}),
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		await screen.findByRole("heading", { name: "Lịch hôm nay" });
		const today = section("Lịch hôm nay");
		expect(today.textContent).toContain("19:00");
		expect(today.textContent).toContain("20:30");
		expect(today.textContent).toContain("IELTS Writing tối");
		expect(today.textContent).toContain("Line chart");
		expect(today.textContent).not.toContain("Lớp đã hủy");
		expect(within(today).getByText("Đã điểm danh")).toBeTruthy();
		// Friday's session is "upcoming this week", not "today".
		expect(screen.getByText(/Bar chart/)).toBeTruthy();
		// Meta joins only non-empty parts, in both variants.
		expect(within(today).getByText("90' · 1:1 · Line chart")).toBeTruthy();
		expect(within(today).getByText("90' · 1:1")).toBeTruthy();
		// Read-only schedule — check-in lives on class/schedule/attendance.
		expect(screen.queryByRole("button", { name: /Điểm danh/ })).toBeNull();
		// Hero summary uses "buổi dạy" (never "ca dạy") so daily-attendance E2E stays clean.
		const heroSummary = screen.getByTestId("dashboard-hero-summary");
		expect(heroSummary.textContent).toContain("Hôm nay có 2 buổi dạy");
		expect(heroSummary.textContent).toContain("còn 1 buổi");
		expect(heroSummary.textContent).not.toContain("ca dạy");
		// Focus Card shows the next session today (19:00).
		const focus = screen.getByTestId("dashboard-focus-card");
		expect(focus.getAttribute("data-state")).toBe("next");
		expect(focus.textContent).toContain("Ca dạy tiếp theo");
		expect(focus.textContent).toContain("IELTS Writing tối");
		// Org stats live in Toàn trung tâm section; redundant KPI & filler subtexts absent.
		expect(screen.queryByText("Buổi học hôm nay")).toBeNull();
		const orgStats = section("Toàn trung tâm");
		expect(within(orgStats).getByText("Tổng học viên")).toBeTruthy();
		expect(within(orgStats).getByText("Bài tập chưa có điểm")).toBeTruthy();
		expect(within(orgStats).getByText("Còn phải thu")).toBeTruthy();
		// When org outstanding is 0đ, do not show misleading "học viên đến hạn" hint.
		expect(within(orgStats).queryByText(/học viên đến hạn/)).toBeNull();
		expect(screen.queryByText("trên tổng bài đã giao")).toBeNull();
		expect(screen.queryByText(/hóa đơn/)).toBeNull();
		expect(screen.queryByText(/cần kiểm tra$/)).toBeNull();
	});

	it("shows live Focus Card progressbar during active session and 'Chưa điểm danh' pill on unattended past session", async () => {
		// 10:30 ICT: 08:00–09:30 is past (upcoming → Chưa điểm danh), 10:00–11:30 is live.
		vi.setSystemTime(new Date("2026-10-07T10:30:00+07:00"));
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "IELTS Sáng", mode: "Offline" }),
					classRow({ id: "cl-2", name: "IELTS Live 10h", mode: "Online" }),
				],
				students: [studentRow({ id: "st-1" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1" }),
					enrollmentRow({ id: "en-2", classId: "cl-2" }),
				],
				lessons: [
					lessonRow({
						id: "l-past",
						classId: "cl-1",
						enrollmentId: "en-1",
						day: 3,
						date: "2026-10-07",
						time: "08:00",
						dur: 90,
						status: "upcoming",
					}),
					lessonRow({
						id: "l-live",
						classId: "cl-2",
						enrollmentId: "en-2",
						day: 3,
						date: "2026-10-07",
						time: "10:00",
						dur: 90,
						status: "upcoming",
					}),
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		const focus = await screen.findByTestId("dashboard-focus-card");
		expect(focus.getAttribute("data-state")).toBe("live");
		expect(within(focus).getByText("Đang dạy")).toBeTruthy();
		expect(within(focus).getByText("IELTS Live 10h")).toBeTruthy();
		expect(within(focus).getByText("Còn 1 giờ")).toBeTruthy();
		const bar = within(focus).getByRole("progressbar", {
			name: "Tiến độ ca dạy",
		});
		expect(bar.getAttribute("aria-valuenow")).toBe("33");

		const today = section("Lịch hôm nay");
		expect(within(today).getByText("Chưa điểm danh")).toBeTruthy();
		expect(within(today).getByText("Đang dạy")).toBeTruthy();
	});

	it("flags only missed check-in and overdue assignment in Cần kiểm tra, shows explicit remaining unit or Chưa có gói, and opens accessible StudentRiskDrawer with real filtered data", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Foundation K12",
						status: "active",
					}),
					classRow({ id: "cl-paused", name: "Lớp Tạm Dừng", status: "paused" }),
					classRow({
						id: "cl-invited",
						name: "Lớp Đang Mời",
						status: "active",
					}),
				],
				students: [
					studentRow({ id: "st-1", name: "Vắng mặt" }),
					studentRow({ id: "st-2", name: "Quên điểm danh" }),
					studentRow({ id: "st-3", name: "Trễ bài tập" }),
					studentRow({ id: "st-4", name: "Ổn định" }),
				],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
					enrollmentRow({
						id: "en-2",
						classId: "cl-1",
						studentId: "st-2",
						status: "active",
					}),
					enrollmentRow({
						id: "en-2-p",
						classId: "cl-paused",
						studentId: "st-2",
						status: "active",
					}),
					enrollmentRow({
						id: "en-2-i",
						classId: "cl-invited",
						studentId: "st-2",
						status: "invited",
					}),
					enrollmentRow({ id: "en-3", classId: "cl-1", studentId: "st-3" }),
					enrollmentRow({ id: "en-4", classId: "cl-1", studentId: "st-4" }),
				],
				packages: [
					{
						id: "pkg-2",
						studentId: "st-2",
						enrollmentId: "en-2",
						classId: "cl-1",
						total: 2,
						price: 4_800_000,
						mode: "Online",
						start: "2026-09-01",
						expiry: "2026-12-31",
						status: "active",
						createdAt: "2026-09-01T00:00:00.000Z",
					},
				],
				lessons: [
					lessonRow({
						id: "a",
						enrollmentId: "en-1",
						day: 1,
						date: "2026-10-05",
						status: "absent",
					}),
					lessonRow({
						id: "b",
						enrollmentId: "en-2",
						day: 2,
						date: "2026-10-06",
						status: "upcoming",
					}),
					lessonRow({
						id: "c",
						enrollmentId: "en-4",
						day: 1,
						date: "2026-10-05",
						status: "completed",
					}),
				],
				classAssignments: [
					{
						id: "ca-1",
						classId: "cl-1",
						promptId: "pr-1",
						title: "Writing Task 2",
						due: "2026-10-05",
						dueAt: null,
						note: "",
						createdAt: "2026-10-01T00:00:00.000Z",
						targets: [
							{
								studentId: "st-3",
								submittedAt: null,
								attemptId: null,
								gradedAt: null,
								band: null,
							},
						],
					},
				],
				assignments: [
					{
						id: "leg-1",
						studentId: "st-3",
						title: "Legacy Essay",
						type: "Writing",
						due: "",
						status: "late",
						scores: null,
					},
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		const risk = section(
			(await screen.findByRole("heading", { name: "Cần kiểm tra" }))
				.textContent ?? "",
		);
		const rowOf = (name: string) =>
			within(risk).getByText(name).closest("button") as HTMLButtonElement;

		expect(rowOf("Quên điểm danh").textContent).toContain("Chưa điểm danh");
		expect(rowOf("Quên điểm danh").textContent).toContain("còn 2 buổi");
		expect(rowOf("Quên điểm danh").textContent).toContain("sắp hết gói");

		expect(rowOf("Trễ bài tập").textContent).toContain("Bài tập trễ hạn");
		expect(rowOf("Trễ bài tập").textContent).toContain("Chưa có gói");
		expect(rowOf("Trễ bài tập").textContent).not.toContain("còn 0 buổi");

		expect(within(risk).queryByText("Vắng mặt")).toBeNull();
		expect(within(risk).queryByText("Ổn định")).toBeNull();
		expect(within(risk).queryByText("Miss check-in")).toBeNull();

		// Open StudentRiskDrawer for st-2: shows active class only (never paused/invited).
		const triggerBtn = rowOf("Quên điểm danh");
		fireEvent.click(triggerBtn);
		const drawer = screen.getByRole("dialog", { name: "Chi tiết học viên" });
		expect(drawer.textContent).toContain("Quên điểm danh");
		expect(drawer.textContent).toContain("IELTS Foundation K12");
		expect(drawer.textContent).not.toContain("Lớp Tạm Dừng");
		expect(drawer.textContent).not.toContain("Lớp Đang Mời");
		expect(drawer.textContent).toContain("còn 2/2 buổi");
		expect(drawer.textContent).toContain("Buổi 06/10");
		const profileLink = within(drawer).getByRole("link", {
			name: /Mở hồ sơ học viên/,
		});
		expect(profileLink.getAttribute("href")).toBe("/students/st-2");

		// Focus trap wraps cleanly in JSDOM: initial focus on Close icon button, Shift+Tab wraps to profileLink.
		const closeIconBtn = within(drawer).getByRole("button", {
			name: "Đóng chi tiết học viên",
		});
		expect(within(drawer).getByRole("button", { name: "Đóng" })).toBeTruthy();
		expect(document.activeElement).toBe(closeIconBtn);
		fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
		expect(document.activeElement).toBe(profileLink);
		fireEvent.keyDown(document, { key: "Tab" });
		expect(document.activeElement).toBe(closeIconBtn);

		// Focus trap pulls focus back into drawer when activeElement escapes outside (e.g., after ⌘K closes or clicking background).
		triggerBtn.focus();
		expect(document.activeElement).toBe(triggerBtn);
		fireEvent.keyDown(document, { key: "Tab" });
		expect(document.activeElement).toBe(closeIconBtn);
		triggerBtn.focus();
		fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
		expect(document.activeElement).toBe(profileLink);

		// Guard: Escape with defaultPrevented must NOT close drawer.
		const preventedEsc = new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true,
			cancelable: true,
		});
		preventedEsc.preventDefault();
		fireEvent(document, preventedEsc);
		expect(
			screen.getByRole("dialog", { name: "Chi tiết học viên" }),
		).toBeTruthy();

		// Guard: Escape while a higher dialog (e.g. ⌘K CommandDialog portal) is open must NOT close drawer.
		const higherPortal = document.createElement("div");
		higherPortal.setAttribute("data-base-ui-portal", "");
		const higherDialog = document.createElement("div");
		higherDialog.setAttribute("role", "dialog");
		higherDialog.setAttribute("data-open", "");
		higherPortal.appendChild(higherDialog);
		document.body.appendChild(higherPortal);
		try {
			fireEvent.keyDown(document, { key: "Escape" });
			expect(
				screen.getByRole("dialog", { name: "Chi tiết học viên" }),
			).toBeTruthy();
		} finally {
			higherPortal.remove();
		}

		// Escape closes drawer and returns focus to trigger button.
		fireEvent.keyDown(document, { key: "Escape" });
		expect(
			screen.queryByRole("dialog", { name: "Chi tiết học viên" }),
		).toBeNull();
		expect(document.activeElement).toBe(triggerBtn);

		// Open drawer for st-3 (legacy due: "" must never render "/").
		fireEvent.click(rowOf("Trễ bài tập"));
		const drawer3 = screen.getByRole("dialog", { name: "Chi tiết học viên" });
		expect(drawer3.textContent).toContain("Writing Task 2");
		expect(drawer3.textContent).toContain("05/10");
		expect(drawer3.textContent).toContain("Legacy Essay");
		expect(drawer3.textContent).not.toContain("hạn nộp /");
	});

	it("hides financial KPI, tuition reminder card, and excludes tuition from Hero openTasks when viewer lacks finance access", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS Writing tối" })],
				students: [studentRow({ id: "st-1" })],
				invoices: [
					invoiceRow({ id: "inv-1", amount: 1_500_000, status: "unpaid" }),
				],
				viewer: { role: "ta", canAccessFinance: false },
			}),
			// Even if reminders payload carries tuition while attendance & grading are 0, UI must fail closed.
			{
				date: "2026-10-07",
				attendance: { pending: 0, items: [] },
				overdueGrading: { count: 0, writing: 0, speaking: 0 },
				tuition: { students: 3, outstanding: 1_500_000 },
			},
		);
		renderWithKernel(<Dashboard />);
		const attendanceCard = await screen.findByTestId(
			"reminder-card-attendance",
		);
		expect(attendanceCard.textContent).toContain("Đã hoàn tất hôm nay");
		expect(screen.getByText("Tổng học viên")).toBeTruthy();
		expect(screen.queryByText("Còn phải thu")).toBeNull();
		expect(screen.queryByTestId("reminder-card-tuition")).toBeNull();
		// Hero summary must NOT leak tuition tasks into openTasks count.
		const heroSummary = screen.getByTestId("dashboard-hero-summary");
		expect(heroSummary.textContent).toContain("Mọi việc hôm nay đã xong.");
		expect(heroSummary.textContent).not.toContain("1 việc");
	});

	it("shows alert error box with Retry button when reminders API fails without faking 'Mọi việc hôm nay đã xong.'", async () => {
		startRemindersServer(snapshotFixture(), { error: "boom" }, 500);
		renderWithKernel(<Dashboard />);
		const alertBox = await screen.findByRole("alert");
		expect(alertBox.textContent).toContain("Không tải được bộ đếm nhắc việc.");
		expect(
			within(alertBox).getByRole("button", { name: "Thử lại" }),
		).toBeTruthy();
		const heroSummary = screen.getByTestId("dashboard-hero-summary");
		expect(heroSummary.textContent).not.toContain("Mọi việc hôm nay đã xong.");
	});

	it("shows an empty org honestly with teacher-facing wording — no demo names, dates or money", async () => {
		startRemindersServer(snapshotFixture());
		const view = renderWithKernel(<Dashboard />);
		await screen.findByText("Không có buổi dạy hôm nay.");
		expect(
			screen.getByText("Không có buổi dạy sắp tới trong tuần."),
		).toBeTruthy();
		expect(screen.getByText("Không có học viên cần kiểm tra.")).toBeTruthy();
		const focus = screen.getByTestId("dashboard-focus-card");
		expect(focus.getAttribute("data-state")).toBe("empty");
		expect(focus.textContent).toContain("Chưa có ca dạy sắp tới");
		const text = view.container.textContent ?? "";
		for (const demo of [
			"cô Lan",
			"Thứ Ba, 19/08",
			"19–25/08",
			"Quốc Bảo",
			"Minh Anh",
			"INV-084",
			"6.2tr",
			"2.0tr",
			"Tuần này",
			"Phòng 201",
		]) {
			expect(text).not.toContain(demo);
		}
		expect(text).toContain("Cô Hạnh");
	});

	it("hiển thị khu vực Việc cần làm hôm nay gọn gàng với 3 thẻ thứ tự 1, 2, 3 từ reminders API và hint Còn phải thu khi có công nợ", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS Writing tối" })],
				students: [studentRow({ id: "st-1" })],
				invoices: [
					invoiceRow({ id: "inv-1", amount: 1_500_000, status: "unpaid" }),
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		const attendanceCard = await screen.findByTestId(
			"reminder-card-attendance",
		);
		expect(
			screen.getByRole("heading", { name: "Việc cần làm hôm nay" }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Làm mới" })).toBeTruthy();
		expect(
			within(attendanceCard).getByTestId("reminder-card-count").textContent,
		).toBe("1 ca dạy");
		expect(
			within(screen.getByTestId("reminder-card-grading")).getByTestId(
				"reminder-card-count",
			).textContent,
		).toBe("2 bài");
		expect(
			within(screen.getByTestId("reminder-card-tuition")).getByTestId(
				"reminder-card-count",
			).textContent,
		).toBe("3 học viên");
		// CTA thẻ điểm danh dẫn đúng hợp đồng URL.
		const link = screen
			.getByRole("link", {
				name: "1. Điểm danh — Ca dạy hôm nay chưa điểm danh",
			})
			.getAttribute("href");
		expect(link).toContain("date=2026-10-07");
		expect(link).toContain("status=pending");
		// Org stats hint appears when outstanding > 0 and dueStudentsCount > 0.
		const orgStats = section("Toàn trung tâm");
		expect(orgStats.textContent).toContain("trong đó 3 học viên đến hạn");
	});

	it("refetch reminders khi kernel snapshot refresh — exact prefix không tự phủ", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS Writing tối" })],
			}),
		);
		renderWithKernel(
			<>
				<Dashboard />
				<KernelRefreshProbe />
			</>,
		);
		await screen.findByTestId("reminder-card-attendance");
		// Chờ counter ổn định (fetch mount theo key dataUpdatedAt đã lắng).
		await vi.waitFor(() => {
			expect(remindersLoads).toBeGreaterThanOrEqual(1);
		});
		const stableLoads = remindersLoads;
		await vi.waitFor(
			() => {
				expect(remindersLoads).toBe(stableLoads);
			},
			{ interval: 50 },
		);
		const loadsBefore = remindersLoads;
		// Date bị fake — đẩy đồng hồ để dataUpdatedAt của snapshot refetch
		// thật sự đổi giá trị, key reminders mới khác key cũ.
		vi.setSystemTime(new Date(WEDNESDAY.getTime() + 1000));
		// Cùng cơ chế với refresh sau action kernel: exact:true trên ["kernel"].
		fireEvent.click(screen.getByText("probe-refresh-kernel"));
		await vi.waitFor(() => {
			expect(remindersLoads).toBeGreaterThan(loadsBefore);
		});
	});

	it("omits lessons and risks belonging to paused classes (#694)", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-paused",
						name: "IELTS Tạm Dừng",
						status: "paused",
					}),
					classRow({
						id: "cl-active",
						name: "IELTS Đang Học",
						status: "active",
					}),
				],
				students: [
					studentRow({ id: "st-p", name: "Minh Tâm" }),
					studentRow({ id: "st-a", name: "Khánh Vy" }),
				],
				enrollments: [
					enrollmentRow({
						id: "en-p",
						classId: "cl-paused",
						studentId: "st-p",
					}),
					enrollmentRow({
						id: "en-a",
						classId: "cl-active",
						studentId: "st-a",
					}),
				],
				lessons: [
					lessonRow({
						id: "les-today",
						classId: "cl-paused",
						enrollmentId: "en-p",
						day: 3,
						date: "2026-10-07",
						status: "upcoming",
					}),
					lessonRow({
						id: "les-week",
						classId: "cl-paused",
						enrollmentId: "en-p",
						day: 5,
						date: "2026-10-09",
						status: "upcoming",
					}),
					lessonRow({
						id: "les-risk-paused",
						classId: "cl-paused",
						enrollmentId: "en-p",
						day: 1,
						date: "2026-10-05",
						status: "upcoming",
					}),
					lessonRow({
						id: "les-risk-active",
						classId: "cl-active",
						enrollmentId: "en-a",
						day: 1,
						date: "2026-10-05",
						status: "upcoming",
					}),
				],
				classAssignments: [
					{
						id: "ca-paused",
						classId: "cl-paused",
						promptId: "pr-1",
						title: "Bài tập lớp tạm dừng",
						due: "2026-10-05",
						dueAt: null,
						note: "",
						createdAt: "2026-10-01T00:00:00.000Z",
						targets: [
							{
								studentId: "st-p",
								submittedAt: null,
								attemptId: null,
								gradedAt: null,
								band: null,
							},
						],
					},
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		await screen.findByText("Không có buổi dạy hôm nay.");
		expect(
			screen.getByText("Không có buổi dạy sắp tới trong tuần."),
		).toBeTruthy();
		expect(screen.queryByText("IELTS Tạm Dừng")).toBeNull();
		const risk = section("Cần kiểm tra");
		expect(within(risk).getByText("Khánh Vy")).toBeTruthy();
		expect(within(risk).queryByText("Minh Tâm")).toBeNull();
	});

	it("pins date kicker to Asia/Ho_Chi_Minh across UTC midnight boundary", async () => {
		// 18:00Z on 2026-10-07 = 01:00+07:00 on Thursday 2026-10-08 in Vietnam.
		vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
		startRemindersServer(snapshotFixture());
		renderWithKernel(<Dashboard />);
		await screen.findByText("Không có buổi dạy hôm nay.");
		expect(screen.getByText(/Thứ Năm, 8 tháng 10, 2026/i)).toBeTruthy();
	});

	it("closes StudentRiskDrawer, clears stale selection, and returns focus to risk heading when student clears risk after refresh", async () => {
		const server = startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
				students: [studentRow({ id: "st-2", name: "Quên điểm danh" })],
				enrollments: [
					enrollmentRow({ id: "en-2", classId: "cl-1", studentId: "st-2" }),
				],
				lessons: [
					lessonRow({
						id: "b",
						enrollmentId: "en-2",
						day: 2,
						date: "2026-10-06",
						status: "upcoming",
					}),
				],
			}),
		);
		renderWithKernel(
			<>
				<Dashboard />
				<KernelRefreshProbe />
			</>,
		);
		const risk = section(
			(await screen.findByRole("heading", { name: "Cần kiểm tra" }))
				.textContent ?? "",
		);
		const trigger = within(risk)
			.getByText("Quên điểm danh")
			.closest("button") as HTMLButtonElement;
		fireEvent.click(trigger);
		expect(
			screen.getByRole("dialog", { name: "Chi tiết học viên" }),
		).toBeTruthy();

		// Student clears risk → refresh kernel → drawer closes and focus falls back to heading.
		server.snapshot.lessons[0] = {
			...server.snapshot.lessons[0],
			status: "completed",
		};
		fireEvent.click(screen.getByText("probe-refresh-kernel"));
		await vi.waitFor(() => {
			expect(
				screen.queryByRole("dialog", { name: "Chi tiết học viên" }),
			).toBeNull();
		});
		expect(document.activeElement).toBe(
			screen.getByRole("heading", { name: "Cần kiểm tra" }),
		);

		// If risk returns later, drawer must NOT zombie-reopen without user click.
		server.snapshot.lessons[0] = {
			...server.snapshot.lessons[0],
			status: "upcoming",
		};
		fireEvent.click(screen.getByText("probe-refresh-kernel"));
		await screen.findByText("Quên điểm danh");
		expect(
			screen.queryByRole("dialog", { name: "Chi tiết học viên" }),
		).toBeNull();
	});

	it("refetches reminders when Vietnam date rolls over midnight on visibilitychange", async () => {
		startRemindersServer(snapshotFixture());
		renderWithKernel(<Dashboard />);
		await screen.findByTestId("reminder-card-attendance");
		await vi.waitFor(() => {
			expect(remindersLoads).toBeGreaterThanOrEqual(1);
		});
		const loadsBefore = remindersLoads;

		// Advance clock past VN midnight (2026-10-08 00:05 ICT) and trigger visibilitychange.
		vi.setSystemTime(new Date("2026-10-08T00:05:00+07:00"));
		Object.defineProperty(document, "hidden", {
			configurable: true,
			value: false,
		});
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.waitFor(() => {
			expect(remindersLoads).toBeGreaterThan(loadsBefore);
		});
	});

	it("surfaces overdue unsubmitted assignments on grading card and updates Hero summary when reminders are zero but risk students exist", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "IELTS Foundation", status: "active" }),
				],
				students: [studentRow({ id: "st-leah", name: "Leah" })],
				enrollments: [
					enrollmentRow({
						id: "en-leah",
						classId: "cl-1",
						studentId: "st-leah",
					}),
				],
				classAssignments: [
					{
						id: "ca-1",
						classId: "cl-1",
						promptId: "pr-1",
						title: "Bài kiểm nhanh GrammarI",
						due: "2026-10-05",
						dueAt: null,
						note: "",
						createdAt: "2026-10-01T00:00:00.000Z",
						targets: [
							{
								studentId: "st-leah",
								submittedAt: null,
								attemptId: null,
								gradedAt: null,
								band: null,
							},
						],
					},
					{
						id: "ca-2",
						classId: "cl-1",
						promptId: "pr-2",
						title: "Bài tập Vocabulary",
						due: "2026-10-06",
						dueAt: null,
						note: "",
						createdAt: "2026-10-01T00:00:00.000Z",
						targets: [
							{
								studentId: "st-leah",
								submittedAt: null,
								attemptId: null,
								gradedAt: null,
								band: null,
							},
						],
					},
				],
			}),
			{
				date: "2026-10-07",
				attendance: { pending: 0, items: [] },
				overdueGrading: { count: 0, writing: 0, speaking: 0 },
				tuition: { students: 0, outstanding: 0 },
			},
		);
		renderWithKernel(<Dashboard />);
		const gradingCard = await screen.findByTestId("reminder-card-grading");
		expect(
			within(gradingCard).getByText("Không còn bài quá hạn chấm"),
		).toBeTruthy();
		expect(within(gradingCard).queryByText("Đã hoàn tất hôm nay")).toBeNull();
		expect(
			within(gradingCard).getByTestId(
				"reminder-card-grading-overdue-unsubmitted",
			).textContent,
		).toContain("Còn 2 bài quá hạn chưa nộp (1 học viên)");

		const heroSummary = screen.getByTestId("dashboard-hero-summary");
		expect(heroSummary.textContent).toContain("Còn 1 học viên cần kiểm tra.");
		expect(heroSummary.textContent).not.toContain("Mọi việc hôm nay đã xong.");
	});

	it("renders Lịch tháng above Cần kiểm tra, switches agenda on day click, navigates months, and returns focus on Hôm nay", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "IELTS Writing tối" }),
					classRow({ id: "cl-2", name: "IELTS Speaking chiều" }),
				],
				students: [studentRow({ id: "st-1" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1" }),
					enrollmentRow({ id: "en-2", classId: "cl-2" }),
				],
				lessons: [
					lessonRow({
						id: "l-today",
						classId: "cl-1",
						enrollmentId: "en-1",
						day: 3,
						date: "2026-10-07",
						time: "19:00",
						status: "upcoming",
					}),
					lessonRow({
						id: "l-fri",
						classId: "cl-2",
						enrollmentId: "en-2",
						day: 5,
						date: "2026-10-09",
						time: "18:00",
						status: "upcoming",
					}),
				],
			}),
		);
		const view = renderWithKernel(<Dashboard />);
		const calHeading = await screen.findByRole("heading", {
			name: "Lịch tháng",
		});
		const riskHeading = screen.getByRole("heading", { name: "Cần kiểm tra" });
		// Lịch tháng appears before Cần kiểm tra in DOM order (top of right column).
		expect(
			Boolean(
				calHeading.compareDocumentPosition(riskHeading) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			),
		).toBe(true);

		const calCard = screen.getByTestId("dashboard-month-calendar");
		expect(screen.getByTestId("dashboard-calendar-month").textContent).toBe(
			"Tháng 10 năm 2026",
		);
		expect(
			within(calCard).queryByRole("button", { name: "Hôm nay" }),
		).toBeNull();

		// Single aria-live="polite" region across the whole dashboard, silent on initial mount.
		const liveRegions = view.container.querySelectorAll('[aria-live="polite"]');
		expect(liveRegions).toHaveLength(1);
		const liveRegion = screen.getByTestId("dashboard-calendar-live");
		expect(liveRegions[0]).toBe(liveRegion);
		expect(liveRegion.textContent).toBe("");

		const day7 = calCard.querySelector<HTMLButtonElement>(
			'[data-cal-day="2026-10-07"]',
		);
		expect(day7).not.toBeNull();
		expect(day7?.getAttribute("aria-pressed")).toBe("true");
		expect(day7?.getAttribute("data-today")).toBe("true");
		expect(day7?.getAttribute("aria-label")).toBe(
			"Ngày 7, hôm nay, 1 buổi dạy",
		);

		const agenda = screen.getByTestId("dashboard-calendar-agenda");
		expect(agenda.textContent).toContain("Hôm nay · 07/10 · 1 buổi dạy");
		expect(agenda.textContent).toContain("19:00");
		expect(agenda.textContent).toContain("IELTS Writing tối");
		expect(calCard.textContent).not.toContain("ca dạy");

		// Click day 9 (Friday with session).
		const day9 = calCard.querySelector<HTMLButtonElement>(
			'[data-cal-day="2026-10-09"]',
		);
		expect(day9).not.toBeNull();
		if (day9) fireEvent.click(day9);
		expect(day9?.getAttribute("aria-pressed")).toBe("true");
		expect(day7?.getAttribute("aria-pressed")).toBe("false");
		expect(agenda.textContent).toContain("Thứ Sáu · 09/10 · 1 buổi dạy");
		expect(agenda.textContent).toContain("18:00");
		expect(agenda.textContent).toContain("IELTS Speaking chiều");

		// Click day 10 (Saturday empty weekend day).
		const day10 = calCard.querySelector<HTMLButtonElement>(
			'[data-cal-day="2026-10-10"]',
		);
		expect(day10?.getAttribute("data-weekend")).toBe("true");
		if (day10) fireEvent.click(day10);
		expect(agenda.textContent).toContain("Thứ Bảy · 10/10");
		expect(within(agenda).getByText("Không có buổi dạy.")).toBeTruthy();
		expect(liveRegion.textContent).toBe(
			"Đã chọn Thứ Bảy 10/10, chưa có buổi dạy",
		);

		// Re-select today before shifting month to verify agenda stays on selected date while browsing months.
		if (day7) fireEvent.click(day7);
		fireEvent.click(within(calCard).getByRole("button", { name: "Tháng sau" }));
		expect(screen.getByTestId("dashboard-calendar-month").textContent).toBe(
			"Tháng 11 năm 2026",
		);
		expect(liveRegion.textContent).toBe("Đang xem Tháng 11 năm 2026");
		expect(agenda.textContent).toContain("Hôm nay · 07/10 · 1 buổi dạy");

		// Select a different empty date in November so Hôm nay proves resetting selectedIso + agenda + liveRegion.
		const nov12 = calCard.querySelector<HTMLButtonElement>(
			'[data-cal-day="2026-11-12"]',
		);
		expect(nov12).not.toBeNull();
		if (nov12) fireEvent.click(nov12);
		expect(nov12?.getAttribute("aria-pressed")).toBe("true");
		expect(agenda.textContent).toContain("Thứ Năm · 12/11");
		expect(within(agenda).getByText("Không có buổi dạy.")).toBeTruthy();

		// Clicking Hôm nay returns to current month, resets selectedIso/agenda, announces return, hides Hôm nay, and focuses today's button.
		const todayBtn = within(calCard).getByRole("button", { name: "Hôm nay" });
		fireEvent.click(todayBtn);
		expect(screen.getByTestId("dashboard-calendar-month").textContent).toBe(
			"Tháng 10 năm 2026",
		);
		expect(
			within(calCard).queryByRole("button", { name: "Hôm nay" }),
		).toBeNull();
		const day7After = calCard.querySelector<HTMLButtonElement>(
			'[data-cal-day="2026-10-07"]',
		);
		expect(day7After?.getAttribute("aria-pressed")).toBe("true");
		expect(document.activeElement).toBe(day7After);
		expect(agenda.textContent).toContain("Hôm nay · 07/10 · 1 buổi dạy");
		expect(agenda.textContent).toContain("IELTS Writing tối");
		expect(liveRegion.textContent).toBe("Đã quay về hôm nay 07/10, 1 buổi dạy");

		// Also exercise previous-month navigation button.
		fireEvent.click(
			within(calCard).getByRole("button", { name: "Tháng trước" }),
		);
		expect(screen.getByTestId("dashboard-calendar-month").textContent).toBe(
			"Tháng 9 năm 2026",
		);
		expect(liveRegion.textContent).toBe("Đang xem Tháng 9 năm 2026");
		expect(
			within(calCard).getByRole("button", { name: "Hôm nay" }),
		).toBeTruthy();
	});

	it("advances Lịch tháng across Vietnam month-end midnight rollover only when user has not picked a custom day", async () => {
		// Branch 1: default selection (following today) rolls over 2026-10-31 → 2026-11-01.
		vi.setSystemTime(new Date("2026-10-31T23:55:00+07:00"));
		startRemindersServer(snapshotFixture());
		renderWithKernel(<Dashboard />);
		await screen.findByTestId("dashboard-month-calendar");
		expect(screen.getByTestId("dashboard-calendar-month").textContent).toBe(
			"Tháng 10 năm 2026",
		);

		vi.setSystemTime(new Date("2026-11-01T00:05:00+07:00"));
		Object.defineProperty(document, "hidden", {
			configurable: true,
			value: false,
		});
		document.dispatchEvent(new Event("visibilitychange"));

		await vi.waitFor(() => {
			expect(screen.getByTestId("dashboard-calendar-month").textContent).toBe(
				"Tháng 11 năm 2026",
			);
		});
		const nov1 = screen
			.getByTestId("dashboard-month-calendar")
			.querySelector<HTMLButtonElement>('[data-cal-day="2026-11-01"]');
		expect(nov1?.getAttribute("aria-pressed")).toBe("true");
		expect(nov1?.getAttribute("data-today")).toBe("true");

		// Branch 2: manual selection on 2026-10-15 must NOT be hijacked into November on rollover.
		cleanup();
		vi.setSystemTime(new Date("2026-10-31T23:55:00+07:00"));
		startRemindersServer(snapshotFixture());
		renderWithKernel(<Dashboard />);
		const calCard2 = await screen.findByTestId("dashboard-month-calendar");
		const oct15 = calCard2.querySelector<HTMLButtonElement>(
			'[data-cal-day="2026-10-15"]',
		);
		expect(oct15).not.toBeNull();
		if (oct15) fireEvent.click(oct15);
		expect(oct15?.getAttribute("aria-pressed")).toBe("true");

		vi.setSystemTime(new Date("2026-11-01T00:05:00+07:00"));
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.waitFor(() => {
			expect(
				within(calCard2).getByRole("button", { name: "Hôm nay" }),
			).toBeTruthy();
		});
		expect(screen.getByTestId("dashboard-calendar-month").textContent).toBe(
			"Tháng 10 năm 2026",
		);
		expect(
			calCard2
				.querySelector<HTMLButtonElement>('[data-cal-day="2026-10-15"]')
				?.getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("excludes paused class historical completed lessons from Lịch tháng (#694)", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-paused",
						name: "IELTS Tạm Dừng Lịch Sử",
						status: "paused",
					}),
				],
				students: [studentRow({ id: "st-p" })],
				enrollments: [
					enrollmentRow({
						id: "en-p",
						classId: "cl-paused",
						studentId: "st-p",
					}),
				],
				lessons: [
					lessonRow({
						id: "les-past-done",
						classId: "cl-paused",
						enrollmentId: "en-p",
						day: 1,
						date: "2026-10-05",
						time: "08:00",
						status: "completed",
					}),
					lessonRow({
						id: "les-today-up",
						classId: "cl-paused",
						enrollmentId: "en-p",
						day: 3,
						date: "2026-10-07",
						time: "19:00",
						status: "upcoming",
					}),
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		const calCard = await screen.findByTestId("dashboard-month-calendar");
		const day5 = calCard.querySelector<HTMLButtonElement>(
			'[data-cal-day="2026-10-05"]',
		);
		expect(day5?.getAttribute("aria-label")).toBe("Ngày 5");
		if (day5) fireEvent.click(day5);
		expect(
			within(screen.getByTestId("dashboard-calendar-agenda")).getByText(
				"Không có buổi dạy.",
			),
		).toBeTruthy();
		expect(screen.queryByText("IELTS Tạm Dừng Lịch Sử")).toBeNull();
	});
});
