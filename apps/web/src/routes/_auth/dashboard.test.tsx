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

// Wednesday (lesson day 3) mid-morning, local time.
const WEDNESDAY = new Date(2026, 9, 7, 10, 0);

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
		.closest("section, .p-6") as HTMLElement;
}

describe("dashboard", () => {
	it("lists today's class sessions from the kernel, skipping cancelled ones", async () => {
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
					// #373: lesson without topic — meta must not end with a dangling ·.
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
		// #373: meta joins only non-empty parts, in both variants.
		expect(within(today).getByText("90' · 1:1 · Line chart")).toBeTruthy();
		expect(within(today).getByText("90' · 1:1")).toBeTruthy();
		// #278: the dashboard is read-only — check-in lives on class/schedule.
		expect(screen.queryByRole("button", { name: /Điểm danh/ })).toBeNull();
	});

	it("flags students with an absence or a missed check-in, and nobody else", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [
					studentRow({ id: "st-1", name: "Vắng mặt" }),
					studentRow({ id: "st-2", name: "Quên điểm danh" }),
					studentRow({ id: "st-3", name: "Ổn định" }),
				],
				enrollments: [
					enrollmentRow({ id: "en-1", studentId: "st-1" }),
					enrollmentRow({ id: "en-2", studentId: "st-2" }),
					enrollmentRow({ id: "en-3", studentId: "st-3" }),
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
						status: "upcoming",
					}),
					lessonRow({
						id: "c",
						enrollmentId: "en-3",
						day: 1,
						status: "completed",
					}),
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
		expect(rowOf("Vắng mặt").textContent).toContain("Vắng");
		expect(rowOf("Quên điểm danh").textContent).toContain("Miss check-in");
		expect(within(risk).queryByText("Ổn định")).toBeNull();
	});

	it("shows an empty org honestly — no demo names, dates or money", async () => {
		startRemindersServer(snapshotFixture());
		const view = renderWithKernel(<Dashboard />);
		await screen.findByText("Không có buổi học nào hôm nay.");
		expect(screen.getByText("Không có học viên rủi ro.")).toBeTruthy();
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

	it("hiển thị khu vực Việc cần làm hôm nay với số đếm từ reminders API", async () => {
		startRemindersServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", name: "IELTS Writing tối" })],
			}),
		);
		renderWithKernel(<Dashboard />);
		expect(
			await screen.findByText("Việc cần làm hôm nay (Thứ Tư, 07/10/2026)"),
		).toBeTruthy();
		expect(screen.getByText("1 ca")).toBeTruthy();
		expect(screen.getByText("2 bài")).toBeTruthy();
		expect(screen.getByText("3 học viên")).toBeTruthy();
		// CTA thẻ điểm danh dẫn đúng hợp đồng URL của AC-001.
		const link = screen
			.getByRole("link", { name: /Ca học hôm nay chưa điểm danh/ })
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
		await screen.findByText("Việc cần làm hôm nay (Thứ Tư, 07/10/2026)");
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
				],
				students: [studentRow({ id: "st-p", name: "Minh Tâm" })],
				enrollments: [
					enrollmentRow({
						id: "en-p",
						classId: "cl-paused",
						studentId: "st-p",
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
						id: "les-risk",
						classId: "cl-paused",
						enrollmentId: "en-p",
						day: 1,
						date: "2026-10-05",
						status: "absent",
					}),
				],
			}),
		);
		renderWithKernel(<Dashboard />);
		await screen.findByText("Không có buổi học nào hôm nay.");
		expect(
			screen.getByText("Không có buổi học nào trong phần còn lại của tuần."),
		).toBeTruthy();
		expect(screen.getByText("Không có học viên rủi ro.")).toBeTruthy();
		expect(screen.queryByText("IELTS Tạm Dừng")).toBeNull();
	});
});
