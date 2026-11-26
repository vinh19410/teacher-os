// @vitest-environment jsdom

import { useQueryClient } from "@tanstack/react-query";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
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
): KernelServer {
	remindersLoads = 0;
	return startKernelServer(snapshot, (req) => {
		if (
			req.method === "GET" &&
			req.path.startsWith("/api/dashboard/reminders")
		) {
			remindersLoads += 1;
			return { status: 200, body: remindersBody };
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
	it("lists today's class sessions from the kernel, drops redundant KPI card, and keeps schedule read-only", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "IELTS Writing tối" }),
					classRow({ id: "cl-2", name: "Lớp đã hủy" }),
				],
				students: [studentRow({ id: "st-1" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-1" }),
					enrollmentRow({ id: "en-2", classId: "cl-2" }),
				],
				lessons: [
					lessonRow({ id: "a", day: 3, time: "19:00", topic: "Line chart" }),
					lessonRow({
						id: "b",
						classId: "cl-2",
						enrollmentId: "en-2",
						day: 3,
						time: "08:00",
						status: "cancelled",
					}),
					lessonRow({ id: "c", day: 5, time: "18:00", topic: "Bar chart" }),
					// Lesson without topic — meta must not end with a dangling ·.
					lessonRow({ id: "d", day: 3, time: "08:00", topic: "" }),
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		await screen.findByRole("heading", { name: "Lịch hôm nay" });
		const today = section("Lịch hôm nay");
		expect(today.textContent).toContain("19:00");
		expect(today.textContent).toContain("IELTS Writing tối");
		expect(today.textContent).toContain("Line chart");
		expect(today.textContent).not.toContain("Lớp đã hủy");
		// Friday's session is "upcoming this week", not "today".
		expect(screen.getByText(/Bar chart/)).toBeTruthy();
		// Meta joins only non-empty parts, in both variants.
		expect(within(today).getByText("90' · 1:1 · Line chart")).toBeTruthy();
		expect(within(today).getByText("90' · 1:1")).toBeTruthy();
		// Read-only schedule — check-in lives on class/schedule/attendance.
		expect(screen.queryByRole("button", { name: /Điểm danh/ })).toBeNull();
		// Redundant KPI card and filler subtexts are removed.
		expect(screen.queryByText("Buổi học hôm nay")).toBeNull();
		expect(screen.getByText("Tổng học viên")).toBeTruthy();
		expect(screen.getByText("Bài tập chưa có điểm")).toBeTruthy();
		expect(screen.getByText("Còn phải thu")).toBeTruthy();
		expect(screen.queryByText("trên tổng bài đã giao")).toBeNull();
		expect(screen.queryByText(/hóa đơn/)).toBeNull();
		expect(screen.queryByText(/cần kiểm tra$/)).toBeNull();
	});

	it("flags only missed check-in and overdue assignment in Cần kiểm tra, shows explicit remaining unit or Chưa có gói", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [
					studentRow({ id: "st-1", name: "Vắng mặt" }),
					studentRow({ id: "st-2", name: "Quên điểm danh" }),
					studentRow({ id: "st-3", name: "Trễ bài tập" }),
					studentRow({ id: "st-4", name: "Ổn định" }),
				],
				enrollments: [
					enrollmentRow({ id: "en-1", studentId: "st-1" }),
					enrollmentRow({ id: "en-2", studentId: "st-2" }),
					enrollmentRow({ id: "en-3", studentId: "st-3" }),
					enrollmentRow({ id: "en-4", studentId: "st-4" }),
				],
				packages: [
					{
						id: "pkg-2",
						studentId: "st-2",
						enrollmentId: "en-2",
						classId: "cl-1",
						total: 24,
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
			}),
		);
		renderWithKernel(<Dashboard />);
		const risk = section(
			(await screen.findByRole("heading", { name: "Cần kiểm tra" }))
				.textContent ?? "",
		);
		const rowOf = (name: string) =>
			within(risk).getByText(name).closest("tr") as HTMLElement;

		expect(rowOf("Quên điểm danh").textContent).toContain("Chưa điểm danh");
		expect(rowOf("Quên điểm danh").textContent).toContain("còn 24 buổi");

		expect(rowOf("Trễ bài tập").textContent).toContain("Bài tập trễ hạn");
		expect(rowOf("Trễ bài tập").textContent).toContain("Chưa có gói");
		expect(rowOf("Trễ bài tập").textContent).not.toContain("còn 0 buổi");

		expect(within(risk).queryByText("Vắng mặt")).toBeNull();
		expect(within(risk).queryByText("Ổn định")).toBeNull();
		expect(within(risk).queryByText("Miss check-in")).toBeNull();
		expect(
			within(risk).queryByText("Học viên rủi ro: vắng mặt hoặc miss check-in"),
		).toBeNull();
	});

	it("hides financial KPI and tuition reminder card when viewer lacks finance access", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS Writing tối" })],
				students: [studentRow({ id: "st-1" })],
				viewer: { role: "ta", canAccessFinance: false },
			}),
			// Even if reminders payload carries tuition, UI must fail closed.
			REMINDERS_BODY,
		);
		renderWithKernel(<Dashboard />);
		await screen.findByText("1 ca dạy");
		expect(screen.getByText("Tổng học viên")).toBeTruthy();
		expect(screen.getByTestId("reminder-card-attendance")).toBeTruthy();
		expect(screen.queryByText("Còn phải thu")).toBeNull();
		expect(screen.queryByTestId("reminder-card-tuition")).toBeNull();
	});

	it("shows an empty org honestly with teacher-facing wording — no demo names, dates or money", async () => {
		startRemindersServer(snapshotFixture());
		const view = renderWithKernel(<Dashboard />);
		await screen.findByText("Không có buổi dạy hôm nay.");
		expect(
			screen.getByText("Không có buổi dạy sắp tới trong tuần."),
		).toBeTruthy();
		expect(screen.getByText("Không có học viên cần kiểm tra.")).toBeTruthy();
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
		]) {
			expect(text).not.toContain(demo);
		}
		expect(text).toContain("Cô Hạnh");
	});

	it("hiển thị khu vực Việc cần làm hôm nay gọn gàng với 3 thẻ thứ tự 1, 2, 3 từ reminders API", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS Writing tối" })],
			}),
		);
		renderWithKernel(<Dashboard />);
		// Chờ nội dung thật từ /api/dashboard/reminders tải xong thay vì heading tĩnh.
		expect(await screen.findByText("1 ca dạy")).toBeTruthy();
		expect(
			screen.getByRole("heading", { name: "Việc cần làm hôm nay" }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Làm mới" })).toBeTruthy();
		expect(screen.getByText("2 bài")).toBeTruthy();
		expect(screen.getByText("3 học viên")).toBeTruthy();
		// CTA thẻ điểm danh dẫn đúng hợp đồng URL.
		const link = screen
			.getByRole("link", {
				name: "1. Điểm danh — Ca dạy hôm nay chưa điểm danh",
			})
			.getAttribute("href");
		expect(link).toContain("date=2026-10-07");
		expect(link).toContain("status=pending");
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
		await screen.findByText("1 ca dạy");
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

	it("pins PageHead date kicker to Asia/Ho_Chi_Minh across UTC midnight boundary", async () => {
		// 18:00Z on 2026-10-07 = 01:00+07:00 on Thursday 2026-10-08 in Vietnam.
		vi.setSystemTime(new Date("2026-10-07T18:00:00Z"));
		startRemindersServer(snapshotFixture());
		renderWithKernel(<Dashboard />);
		await screen.findByText("Không có buổi dạy hôm nay.");
		expect(screen.getByText(/Thứ Năm, 8 tháng 10, 2026/i)).toBeTruthy();
	});
});
