// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouterState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

async function loadStudentsRoute() {
	vi.stubEnv("VITE_STUDENT_PORTAL_ENABLED", "false");
	vi.resetModules();
	const [{ StudentsRoute }, harness] = await Promise.all([
		import("./index"),
		import("@/test/kernel-harness"),
	]);
	return { StudentsRoute, ...harness };
}

beforeEach(resetRouterState);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe("students list with the student portal hidden", () => {
	it("keeps the list and drops every invitation entry point", async () => {
		const {
			StudentsRoute,
			renderWithKernel,
			snapshotFixture,
			startKernelServer,
			studentRow,
		} = await loadStudentsRoute();
		startKernelServer(
			snapshotFixture({
				students: [studentRow({ id: "st-1", name: "Học viên Một" })],
			}),
			(req) =>
				req.path === "/api/students/invitations"
					? { status: 200, body: [{ id: "iv-1", status: "pending" }] }
					: undefined,
		);
		renderWithKernel(<StudentsRoute />);
		expect(await screen.findByText("Học viên Một")).toBeTruthy();
		expect(screen.getByText("1 học viên đang học")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Mời học viên/ })).toBeNull();
		expect(screen.queryByRole("tab")).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("does not tell an empty org to wait for portal sign-ups", async () => {
		const {
			StudentsRoute,
			renderWithKernel,
			snapshotFixture,
			startKernelServer,
		} = await loadStudentsRoute();
		startKernelServer(snapshotFixture({ students: [] }));
		renderWithKernel(<StudentsRoute />);
		const empty = await screen.findByTestId("students-empty-state");
		expect(empty.textContent).not.toMatch(/portal/i);
	});
});
