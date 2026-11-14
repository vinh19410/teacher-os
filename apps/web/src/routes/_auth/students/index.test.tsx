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
	);
}

beforeEach(resetRouterState);

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("students list", () => {
	it("lists every student from the kernel snapshot without org tabs", async () => {
		startServer();
		renderWithKernel(<StudentsRoute />);
		expect(await screen.findByText("Học viên Một")).toBeTruthy();
		expect(screen.getByText("Học viên Hai")).toBeTruthy();
		expect(screen.queryByRole("tab")).toBeNull();
	});

	it("supports manual student creation (Thêm học viên) without Mời học viên or Lời mời đang chờ UI (#716)", async () => {
		const server = startServer();
		renderWithKernel(<StudentsRoute />);
		await screen.findByText("Học viên Một");
		expect(screen.queryByRole("button", { name: /Mời học viên/ })).toBeNull();
		expect(screen.queryByRole("tab", { name: /Lời mời đang chờ/ })).toBeNull();
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
	it("counts students and those needing attention from live data (#716)", async () => {
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
		);
		renderWithKernel(<StudentsRoute />);
		expect(await screen.findByText("3 học viên")).toBeTruthy();
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

	it("#716: hides org invite badges/buttons when student has email and portalLinked=false, while keeping Chưa liên kết Portal for empty email", async () => {
		vi.unstubAllGlobals();
		startKernelServer(
			snapshotFixture({
				students: [
					studentRow({
						id: "st-pending",
						name: "Lê Chờ Xác Nhận",
						email: "pending@example.com",
						portalLinked: false,
					}),
					studentRow({
						id: "st-no-email",
						name: "Trần Chưa Email",
						email: "",
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
		);
		renderWithKernel(<StudentsRoute />);
		await screen.findByText("Lê Chờ Xác Nhận");
		expect(screen.getByText("Trần Chưa Email")).toBeTruthy();
		expect(screen.getByText("Phạm Đã Vào")).toBeTruthy();

		expect(screen.queryByRole("button", { name: /Mời học viên/ })).toBeNull();
		expect(screen.queryByRole("tab", { name: /Lời mời đang chờ/ })).toBeNull();
		expect(screen.queryByText("Chờ xác nhận")).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Gửi lại lời mời/ }),
		).toBeNull();
		expect(screen.getAllByText("Chưa liên kết Portal")).toHaveLength(1);
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
