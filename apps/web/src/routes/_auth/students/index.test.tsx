// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
	invoiceRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { resetRouterState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { StudentsRoute } from "./index";

function startServer() {
	return startKernelServer(
		snapshotFixture({
			classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
			students: [
				studentRow({ id: "st-1", name: "Học viên Một" }),
				studentRow({ id: "st-2", name: "Học viên Hai" }),
			],
			enrollments: [enrollmentRow({ classId: "cl-1", studentId: "st-1" })],
		}),
		(req) =>
			req.path === "/api/students/invitations"
				? { status: 200, body: [] }
				: undefined,
	);
}

beforeEach(resetRouterState);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("students list", () => {
	it("lists every student from the kernel snapshot", async () => {
		startServer();
		renderWithKernel(<StudentsRoute />);
		expect(await screen.findByText("Học viên Một")).toBeTruthy();
		expect(screen.getByText("Học viên Hai")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Học viên (2)" })).toBeTruthy();
	});

	it("adds students only by invitation — no manual create or enroll from the list", async () => {
		startServer();
		renderWithKernel(<StudentsRoute />);
		await screen.findByText("Học viên Một");
		expect(screen.getByRole("button", { name: /Mời học viên/ })).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Thêm học viên/ })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /Mời học viên/ }));
		const dialogs = screen.getAllByRole("dialog");
		expect(dialogs).toHaveLength(1);
		expect(dialogs[0].textContent).not.toMatch(/Thêm học viên vào lớp/);
	});
});

describe("students list header and filters", () => {
	it("counts students, pending invitations and those needing attention from live data", async () => {
		vi.unstubAllGlobals();
		startKernelServer(
			snapshotFixture({
				students: [
					studentRow({ id: "st-1", name: "Học viên Một" }),
					studentRow({ id: "st-2", name: "Học viên Hai" }),
					studentRow({ id: "st-3", name: "Học viên Ba" }),
				],
				invoices: [invoiceRow({ id: "inv-1", studentId: "st-2" })],
			}),
			(req) =>
				req.path === "/api/students/invitations"
					? {
							status: 200,
							body: [
								{ id: "iv-1", status: "pending" },
								{ id: "iv-2", status: "accepted" },
							],
						}
					: undefined,
		);
		renderWithKernel(<StudentsRoute />);
		expect(
			await screen.findByText("3 học viên đang học · 1 lời mời đang chờ"),
		).toBeTruthy();
		expect(
			screen.getByText("1 cần chú ý (nợ học phí / sắp hết gói)"),
		).toBeTruthy();
	});

	it("filters with Vietnamese chips", async () => {
		startServer();
		renderWithKernel(<StudentsRoute />);
		await screen.findByText("Học viên Một");
		expect(
			within(screen.getByRole("group"))
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["Tất cả", "Sắp hết buổi", "Nợ học phí", "Viết", "Nói"]);
	});
});
