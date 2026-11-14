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
	invoiceRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

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
		expect(screen.getByRole("tab", { name: "Học viên (2)" })).toBeTruthy();
	});

	it("supports both manual student creation (Thêm học viên) and email invitation (Mời học viên)", async () => {
		const server = startServer();
		renderWithKernel(<StudentsRoute />);
		await screen.findByText("Học viên Một");
		expect(screen.getByRole("button", { name: /Mời học viên/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Thêm học viên" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Thêm học viên" }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText(/Họ tên học viên/), {
			target: { value: "Nguyễn Văn Mới" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		await waitFor(() =>
			expect(server.writes.filter((w) => w.method !== "GET")).toEqual([
				{
					method: "POST",
					path: "/api/students",
					body: {
						name: "Nguyễn Văn Mới",
						phone: "",
						email: "",
						parentName: "",
						parentPhone: "",
						activateNow: true,
					},
				},
			]),
		);
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

	it("#570: renders Chờ xác nhận badge and Gửi lại lời mời action when student has email and portalLinked=false", async () => {
		vi.unstubAllGlobals();
		const server = startKernelServer(
			snapshotFixture({
				students: [
					studentRow({
						id: "st-pending",
						name: "Lê Chờ Xác Nhận",
						email: "pending@example.com",
						portalLinked: false,
					}),
					studentRow({
						id: "st-joined",
						name: "Phạm Đã Vào",
						email: "joined@example.com",
						portalLinked: true,
					}),
				],
			}),
			(req) => {
				if (req.path === "/api/students/invitations") {
					return { status: 200, body: [] };
				}
				if (
					req.method === "POST" &&
					req.path === "/api/students/st-pending/resend-invite"
				) {
					return {
						status: 200,
						body: { ok: true, id: "st-pending", updatedAt: Date.now() },
					};
				}
				return undefined;
			},
		);
		renderWithKernel(<StudentsRoute />);
		await screen.findByText("Lê Chờ Xác Nhận");
		expect(screen.getAllByText("Chờ xác nhận")).toHaveLength(1);
		const resendBtn = screen.getByRole("button", { name: /Gửi lại lời mời/ });
		fireEvent.click(resendBtn);
		await waitFor(() => {
			expect(
				server.writes.some(
					(r) =>
						r.method === "POST" &&
						r.path === "/api/students/st-pending/resend-invite",
				),
			).toBe(true);
		});
		expect(routerState.navigate).not.toHaveBeenCalled();
	});

	it("#616: unifies pending count and includes unlinked portal student in Lời mời đang chờ tab", async () => {
		vi.unstubAllGlobals();
		const server = startKernelServer(
			snapshotFixture({
				students: [
					studentRow({
						id: "st-unlinked",
						name: "Học Viên Chờ Cổng",
						email: "chocong@example.com",
						portalLinked: false,
					}),
					studentRow({
						id: "st-active",
						name: "Học Viên Đang Học",
						email: "danghoc@example.com",
						portalLinked: true,
					}),
				],
			}),
			(req) => {
				if (req.path === "/api/students/invitations") {
					return { status: 200, body: [] };
				}
				if (
					req.method === "POST" &&
					req.path === "/api/students/st-unlinked/resend-invite"
				) {
					return {
						status: 200,
						body: { ok: true, id: "st-unlinked", updatedAt: Date.now() },
					};
				}
				return undefined;
			},
		);
		renderWithKernel(<StudentsRoute />);
		await screen.findByText("Học Viên Đang Học");

		// Kicker does NOT count unlinked student into "đang học", counts them in "lời mời đang chờ"
		expect(
			screen.getByText("1 học viên đang học · 1 lời mời đang chờ"),
		).toBeTruthy();

		// Tabs: "Học viên (2)" retains full org roster, "Lời mời đang chờ (1)" reflects pending
		expect(screen.getByRole("tab", { name: "Học viên (2)" })).toBeTruthy();
		const invitesTab = screen.getByRole("tab", {
			name: "Lời mời đang chờ (1)",
		});
		expect(invitesTab).toBeTruthy();

		// Click "Lời mời đang chờ (1)" tab -> renders pending student row with resend button
		fireEvent.click(invitesTab);
		expect(await screen.findByText("Học Viên Chờ Cổng")).toBeTruthy();
		expect(screen.getByText("chocong@example.com")).toBeTruthy();
		expect(screen.getAllByText("Chờ xác nhận")).toHaveLength(1);
		expect(screen.queryByText("Chưa có lời mời nào đang chờ")).toBeNull();

		const resendBtn = screen.getByRole("button", { name: /Gửi lại lời mời/ });
		fireEvent.click(resendBtn);
		await waitFor(() => {
			expect(
				server.writes.some(
					(r) =>
						r.method === "POST" &&
						r.path === "/api/students/st-unlinked/resend-invite",
				),
			).toBe(true);
		});
	});

	it("hides paused classes from AddStudentModal class selector (#694)", async () => {
		vi.unstubAllGlobals();
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-a", name: "Lớp Đang Học", status: "active" }),
					classRow({ id: "cl-p", name: "Lớp Tạm Dừng", status: "paused" }),
				],
			}),
			(req) =>
				req.path === "/api/students/invitations"
					? { status: 200, body: [] }
					: undefined,
		);
		renderWithKernel(<StudentsRoute />);
		const addButtons = await screen.findAllByRole("button", {
			name: "Thêm học viên",
		});
		fireEvent.click(addButtons[0]);
		const dialog = screen.getByRole("dialog", { name: "Thêm học viên mới" });
		const options = within(dialog)
			.getAllByRole("option")
			.map((o) => o.textContent);
		expect(options).toContain("Lớp Đang Học");
		expect(options).not.toContain("Lớp Tạm Dừng");
	});
});
