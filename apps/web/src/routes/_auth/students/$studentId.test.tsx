// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
	RouteErrorBoundary,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { Route } from "./$studentId";

const StudentDetail = (Route as unknown as { component: () => React.ReactNode })
	.component;

beforeEach(() => {
	resetRouterState();
	startKernelServer(
		snapshotFixture({
			classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
			students: [
				studentRow({ id: "st-1", name: "Học viên Một", phone: "0901000001" }),
				studentRow({ id: "st-2", name: "Học viên Hai", phone: "0902000002" }),
			],
			enrollments: [enrollmentRow({ classId: "cl-1", studentId: "st-1" })],
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("student detail", () => {
	it("shows the student named in the URL, not another one", async () => {
		routerState.params = { studentId: "st-2" };
		renderWithKernel(<StudentDetail />);
		expect(
			await screen.findByRole("heading", { level: 1, name: "Học viên Hai" }),
		).toBeTruthy();
		expect(screen.getByText(/0902000002/)).toBeTruthy();
		expect(screen.queryByText("Học viên Một")).toBeNull();
	});

	it("treats an unknown student id as not found", async () => {
		routerState.params = { studentId: "st-missing" };
		vi.spyOn(console, "error").mockImplementation(() => {});
		renderWithKernel(
			<RouteErrorBoundary>
				<StudentDetail />
			</RouteErrorBoundary>,
		);
		expect((await screen.findByTestId("route-error")).textContent).toBe(
			"not-found",
		);
	});

	it("renders 'Chưa đặt mục tiêu' when student has no targetBand or skills", async () => {
		routerState.params = { studentId: "st-1" };
		renderWithKernel(<StudentDetail />);
		expect(
			await screen.findByRole("heading", { level: 1, name: "Học viên Một" }),
		).toBeTruthy();
		expect(screen.getByText("Chưa đặt mục tiêu")).toBeTruthy();
		expect(screen.queryByText(/Band —/)).toBeNull();
		expect(screen.queryByText(/\(\)/)).toBeNull();
	});
});
