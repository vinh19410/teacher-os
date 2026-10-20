// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
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
		startKernelServer(
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
		startKernelServer(
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
		startKernelServer(snapshotFixture());
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
});
