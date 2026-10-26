// @vitest-environment jsdom

import {
	act,
	cleanup,
	fireEvent,
	screen,
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

// Vitest hoists vi.mock above top-level imports, so the factory must load router-mock dynamically.
vi.mock("@tanstack/react-router", async () => {
	const mod = await import("@/test/router-mock");
	return mod.routerMock();
});

import { DebtsRoute } from "./index";

const Debts = DebtsRoute;

const TODAY_DATE = new Date("2026-10-26T03:00:00.000Z"); // 2026-10-26 10:00 VN

function startDebtsServer() {
	return startKernelServer(
		snapshotFixture({
			classes: [
				classRow({ id: "cl-1", name: "IELTS 6.5A" }),
				classRow({ id: "cl-2", name: "IELTS 5.0B" }),
			],
			students: [
				studentRow({
					id: "st-1",
					name: "Nguyễn Minh Anh",
					phone: "0901112222",
					email: "minhanh@example.com",
				}),
				studentRow({
					id: "st-2",
					name: "Trần Hoàng Nam",
					phone: "0903334444",
					email: "hoangnam@example.com",
				}),
				studentRow({
					id: "st-3",
					name: "Lê Thu Hà",
					phone: "0905556666",
					email: "thuha@example.com",
				}),
				studentRow({
					id: "st-4",
					name: "Đặng Quốc Bảo",
					phone: "0907778888",
					email: "quocbao@example.com",
				}),
			],
			enrollments: [
				enrollmentRow({
					id: "en-1",
					classId: "cl-1",
					studentId: "st-1",
					status: "active",
				}),
				enrollmentRow({
					id: "en-2",
					classId: "cl-2",
					studentId: "st-2",
					status: "active",
				}),
				enrollmentRow({
					id: "en-3",
					classId: "cl-1",
					studentId: "st-3",
					status: "active",
				}),
				enrollmentRow({
					id: "en-4",
					classId: "cl-2",
					studentId: "st-4",
					status: "active",
				}),
			],
			invoices: [
				invoiceRow({
					id: "inv-1",
					studentId: "st-1",
					enrollmentId: "en-1",
					amount: 4_500_000,
					paidAmount: 2_000_000,
					status: "pending",
					due: "2026-10-20", // overdue
				}),
				invoiceRow({
					id: "inv-2",
					studentId: "st-2",
					enrollmentId: "en-2",
					amount: 3_800_000,
					paidAmount: 0,
					status: "pending",
					due: "2026-10-29", // due_soon (<= 7d)
				}),
				invoiceRow({
					id: "inv-3",
					studentId: "st-3",
					enrollmentId: "en-3",
					amount: 4_500_000,
					paidAmount: 4_500_000,
					status: "paid",
					due: "2026-10-15", // clear
				}),
				invoiceRow({
					id: "inv-4",
					studentId: "st-4",
					enrollmentId: "en-4",
					amount: 2_200_000,
					paidAmount: 0,
					status: "pending",
					due: "2026-11-15", // due (> 7d)
				}),
			],
		}),
	);
}

function kpi(label: string): HTMLElement {
	const kpis = screen.getByTestId("debt-kpis");
	return within(kpis).getByText(label).parentElement as HTMLElement;
}

beforeEach(() => {
	resetRouterState();
	vi.setSystemTime(TODAY_DATE);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("DebtsRoute (/debts — TOS-15 #449)", () => {
	it("render đủ 3 thẻ KPI và bảng học viên kèm 4 badge trạng thái công nợ", async () => {
		startDebtsServer();
		renderWithKernel(<Debts />);

		await screen.findByText("Tổng phải thu kỳ này");
		expect(kpi("Tổng phải thu kỳ này").textContent).toContain("15.000.000đ");
		expect(kpi("Tổng phải thu kỳ này").textContent).toContain("4 học viên");

		expect(kpi("Tổng đã thu").textContent).toContain("6.500.000đ");
		expect(kpi("Tổng đã thu").textContent).toContain("1 học viên");

		expect(kpi("Tổng còn nợ quá hạn").textContent).toContain("2.500.000đ");
		expect(kpi("Tổng còn nợ quá hạn").textContent).toContain("1 học viên");
		expect(
			within(screen.getByTestId("debt-kpis")).getByText("Tổng còn nợ quá hạn")
				.previousElementSibling?.className,
		).toContain("text-destructive");

		const table = screen.getByTestId("debt-ledger-table");
		const rows = within(table).getAllByRole("row").slice(1);
		expect(rows).toHaveLength(4);

		expect(rows[0]?.textContent).toContain("Nguyễn Minh Anh");
		expect(rows[0]?.textContent).toContain("IELTS 6.5A");
		expect(rows[0]?.textContent).toContain("4.500.000đ");
		expect(rows[0]?.textContent).toContain("2.000.000đ");
		expect(rows[0]?.textContent).toContain("2.500.000đ");
		expect(rows[0]?.textContent).toContain("20/10");
		expect(rows[0]?.textContent).toContain("Quá hạn");

		expect(rows[1]?.textContent).toContain("Trần Hoàng Nam");
		expect(rows[1]?.textContent).toContain("Sắp đến hạn");

		expect(rows[2]?.textContent).toContain("Lê Thu Hà");
		expect(rows[2]?.textContent).toContain("Đã thu đủ");

		expect(rows[3]?.textContent).toContain("Đặng Quốc Bảo");
		expect(rows[3]?.textContent).toContain("Còn nợ");
	});

	it("bấm chip trạng thái gọi navigate với search.status và replace: true", async () => {
		startDebtsServer();
		renderWithKernel(<Debts />);
		await screen.findByText("Tổng phải thu kỳ này");

		const chipGroup = screen.getByRole("group", {
			name: "Lọc trạng thái công nợ",
		});
		fireEvent.click(within(chipGroup).getByRole("button", { name: "Quá hạn" }));

		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/debts",
			search: { status: "overdue" },
			replace: true,
		});
	});

	it("vào /debts?status=clear hiển thị chip Đã thu đủ active, lọc còn 1 dòng nhưng giữ nguyên 3 thẻ KPI (D5)", async () => {
		routerState.search = { status: "clear" };
		startDebtsServer();
		renderWithKernel(<Debts />);
		await screen.findByText("Tổng phải thu kỳ này");

		const chipGroup = screen.getByRole("group", {
			name: "Lọc trạng thái công nợ",
		});
		const clearChip = within(chipGroup).getByRole("button", {
			name: "Đã thu đủ",
		});
		expect(clearChip.getAttribute("aria-pressed")).toBe("true");

		const table = screen.getByTestId("debt-ledger-table");
		const rows = within(table).getAllByRole("row").slice(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.textContent).toContain("Lê Thu Hà");

		// KPI không về 0 khi chọn Đã thu đủ (D5)
		expect(kpi("Tổng còn nợ quá hạn").textContent).toContain("2.500.000đ");
		expect(kpi("Tổng phải thu kỳ này").textContent).toContain("15.000.000đ");

		// Bấm Xóa bộ lọc trả URL về sạch
		fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/debts",
			search: {},
			replace: true,
		});
	});

	it("gõ tìm kiếm debounce 300ms mới đẩy q lên URL 1 lần và lọc theo tên không dấu", async () => {
		startDebtsServer();
		renderWithKernel(<Debts />);
		await screen.findByText("Tổng phải thu kỳ này");

		vi.useFakeTimers();
		vi.setSystemTime(TODAY_DATE);

		const searchInput = screen.getByRole("textbox", {
			name: "Tìm học viên hoặc số điện thoại",
		});
		fireEvent.change(searchInput, { target: { value: "tran" } });
		fireEvent.change(searchInput, { target: { value: "tran hoang" } });

		// Chưa đủ 300ms → chưa gọi navigate
		act(() => {
			vi.advanceTimersByTime(250);
		});
		expect(routerState.navigate).not.toHaveBeenCalled();

		// Bảng và KPI đã lọc ngay theo query local không dấu
		const table = screen.getByTestId("debt-ledger-table");
		const rows = within(table).getAllByRole("row").slice(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.textContent).toContain("Trần Hoàng Nam");
		expect(kpi("Tổng phải thu kỳ này").textContent).toContain("3.800.000đ");

		// Đủ 300ms → navigate đúng 1 lần với search.q
		act(() => {
			vi.advanceTimersByTime(60);
		});
		expect(routerState.navigate).toHaveBeenCalledTimes(1);
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/debts",
			search: { q: "tran hoang" },
			replace: true,
		});
	});

	it("đổi select Lớp cập nhật URL ?lop= và khi vào /debts?lop=cl-1 thì KPI tính riêng cho lớp đó", async () => {
		routerState.search = { lop: "cl-1" };
		startDebtsServer();
		renderWithKernel(<Debts />);
		await screen.findByText("Tổng phải thu kỳ này");

		// Lớp cl-1 chỉ có Nguyễn Minh Anh (4.5M) và Lê Thu Hà (4.5M) = 9.000.000đ
		expect(kpi("Tổng phải thu kỳ này").textContent).toContain("9.000.000đ");
		expect(kpi("Tổng phải thu kỳ này").textContent).toContain("2 học viên");

		const classSelect = screen.getByRole("combobox", {
			name: "Lọc theo lớp",
		});
		fireEvent.change(classSelect, { target: { value: "cl-2" } });
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/debts",
			search: { lop: "cl-2" },
			replace: true,
		});
	});

	it("click dòng học viên điều hướng sang /students/$studentId và nút + Tạo khoản thu mở AddInvoiceModal", async () => {
		startDebtsServer();
		renderWithKernel(<Debts />);
		await screen.findByText("Tổng phải thu kỳ này");

		const table = screen.getByTestId("debt-ledger-table");
		const firstRow = within(table).getAllByRole("row")[1];
		if (!firstRow) throw new Error("missing first row");
		fireEvent.click(firstRow);
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/students/$studentId",
			params: { studentId: "st-1" },
		});

		fireEvent.click(screen.getByTestId("create-invoice"));
		expect(
			await screen.findByRole("heading", { name: "Tạo hóa đơn" }),
		).toBeTruthy();
	});

	it("hiển thị empty state khi chưa có hóa đơn nào và khi bộ lọc không khớp", async () => {
		startKernelServer(snapshotFixture());
		const view = renderWithKernel(<Debts />);
		expect(await screen.findByTestId("debts-empty")).toBeTruthy();
		expect(screen.getByText("Chưa có khoản thu nào")).toBeTruthy();
		view.unmount();

		routerState.search = { q: "khong-ton-tai" };
		startDebtsServer();
		renderWithKernel(<Debts />);
		expect(await screen.findByTestId("debts-filtered-empty")).toBeTruthy();
		expect(screen.getByText("Không có học viên khớp bộ lọc")).toBeTruthy();
	});
});
