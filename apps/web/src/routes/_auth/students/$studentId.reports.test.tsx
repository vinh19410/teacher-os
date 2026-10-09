// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
// Parent reports ship behind a static flag; this suite covers the enabled UI.
vi.mock("@/lib/features", () => ({ PARENT_REPORTS_ENABLED: true }));

import { Route } from "./$studentId";

const StudentDetail = (Route as unknown as { component: () => React.ReactNode })
	.component;

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("student detail → parent report (flag on)", () => {
	it("opens the weekly report for the student being viewed", async () => {
		startKernelServer(
			snapshotFixture({
				students: [
					studentRow({ id: "st-1", name: "Học viên Một" }),
					studentRow({ id: "st-2", name: "Học viên Hai" }),
				],
			}),
		);
		routerState.params = { studentId: "st-2" };
		renderWithKernel(<StudentDetail />);
		fireEvent.click(await screen.findByRole("button", { name: "Tạo báo cáo" }));
		const dialog = screen.getByRole("dialog");
		expect(
			(within(dialog).getByLabelText("Học viên") as HTMLSelectElement).value,
		).toBe("st-2");
	});
});
