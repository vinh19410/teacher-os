// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Mock Link giữ nguyên `to` (router thật mới resolve params) nhưng CAPTURE
 * params để test pin đúng lớp được link — mutation đổi classId qua được gate. */
const capturedParams = vi.hoisted(() => ({
	current: undefined as unknown,
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		children,
	}: {
		to: string;
		params?: unknown;
		children?: React.ReactNode;
	}) => {
		capturedParams.current = params;
		return <a href={to}>{children}</a>;
	},
}));

import type { StudentTuitionSummary as Summary } from "@/lib/tuition-from-kernel";
import { StudentTuitionSummary } from "./student-tuition-summary";

/** Giá trị số trên thẻ StatCard: nhãn đứng sau số trong cùng Card. */
function statValue(label: string): string {
	return screen.getByText(label).previousElementSibling?.textContent ?? "";
}

function baseSummary(overrides: Partial<Summary> = {}): Summary {
	return {
		classes: [],
		totalFee: 0,
		totalPaid: 0,
		totalRemaining: 0,
		countedClasses: 0,
		unlinkedPaid: 0,
		...overrides,
	};
}

afterEach(cleanup);

describe("StudentTuitionSummary", () => {
	it("một lớp 10tr đã đóng 2tr → 3 thẻ đúng số, dòng lớp đủ 4 ô", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "[TEST] Foundation 2",
							enrollmentStatus: "active",
							fee: 10000000,
							paid: 2000000,
							remaining: 8000000,
							overpaid: 0,
							counted: true,
						},
					],
					totalFee: 10000000,
					totalPaid: 2000000,
					totalRemaining: 8000000,
					countedClasses: 1,
				})}
			/>,
		);
		expect(statValue("Tổng học phí (VND)")).toBe("10.000.000đ");
		expect(statValue("Đã đóng (VND)")).toBe("2.000.000đ");
		expect(statValue("Còn lại (VND)")).toBe("8.000.000đ");

		const row = screen.getByRole("row", { name: /\[TEST\] Foundation 2/ });
		expect(within(row).getByText("10.000.000đ")).toBeTruthy();
		expect(within(row).getByText("2.000.000đ")).toBeTruthy();
		expect(within(row).getByText("8.000.000đ")).toBeTruthy();

		const link = within(row).getByRole("link", {
			name: "[TEST] Foundation 2",
		});
		// Mock Link giữ nguyên `to` — params resolve là việc của router thật.
		expect(link.getAttribute("href")).toBe("/classes/$classId");
		expect(capturedParams.current).toEqual({ classId: "C1" });
	});

	it("lớp counted còn lại 0 → Badge 'Đã đóng đủ'; đóng dư → 'Dư Xđ'", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "Đủ rồi",
							enrollmentStatus: "active",
							fee: 5000000,
							paid: 5000000,
							remaining: 0,
							overpaid: 0,
							counted: true,
						},
						{
							classId: "C2",
							className: "Thừa tiền",
							enrollmentStatus: "active",
							fee: 5000000,
							paid: 6000000,
							remaining: 0,
							overpaid: 1000000,
							counted: true,
						},
					],
					totalFee: 10000000,
					totalPaid: 11000000,
					totalRemaining: 0,
					countedClasses: 2,
				})}
			/>,
		);
		const paidRow = screen.getByRole("row", { name: /Đủ rồi/ });
		expect(within(paidRow).getByText("Đã đóng đủ")).toBeTruthy();
		const overRow = screen.getByRole("row", { name: /Thừa tiền/ });
		expect(within(overRow).getByText("Dư 1.000.000đ")).toBeTruthy();
	});

	it("Còn lại > 0 → số trên thẻ đỏ text-danger như KPI Doanh thu", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "C1",
							enrollmentStatus: "active",
							fee: 10000000,
							paid: 2000000,
							remaining: 8000000,
							overpaid: 0,
							counted: true,
						},
					],
					totalFee: 10000000,
					totalPaid: 2000000,
					totalRemaining: 8000000,
					countedClasses: 1,
				})}
			/>,
		);
		// StatCard hot (v2): số mang text-destructive — label là div kế bên,
		// đi 1 cấp lên rồi đọc phần tử số.
		const label = screen.getByText("Còn lại (VND)");
		const value = label.previousElementSibling!;
		expect(value.className).toContain("text-destructive");
	});

	it("lớp invited hiện badge 'Đã mời' và ô Còn lại 'Chưa kích hoạt — chưa tính'", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "Writing Pro",
							enrollmentStatus: "invited",
							fee: 6000000,
							paid: 0,
							remaining: 0,
							overpaid: 0,
							counted: false,
						},
					],
				})}
			/>,
		);
		const row = screen.getByRole("row", { name: /Writing Pro/ });
		expect(within(row).getByText("Đã mời")).toBeTruthy();
		expect(within(row).getByText("Chưa kích hoạt — chưa tính")).toBeTruthy();
	});

	it("status lạ (pending) hiển thị như invited — badge + chưa tính (red-team #8)", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "Legacy Class",
							enrollmentStatus: "pending",
							fee: 6000000,
							paid: 0,
							remaining: 0,
							overpaid: 0,
							counted: false,
						},
					],
				})}
			/>,
		);
		const row = screen.getByRole("row", { name: /Legacy Class/ });
		expect(within(row).getByText("Đã mời")).toBeTruthy();
		expect(within(row).getByText("Chưa kích hoạt — chưa tính")).toBeTruthy();
	});

	it("lớp chưa thiết lập học phí hiện 'Chưa thiết lập' nhưng vẫn thấy tiền đã thu", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "IELTS 6.5",
							enrollmentStatus: "active",
							fee: null,
							paid: 2000000,
							remaining: 0,
							overpaid: 0,
							counted: false,
						},
					],
				})}
			/>,
		);
		const row = screen.getByRole("row", { name: /IELTS 6\.5/ });
		expect(within(row).getByText("Chưa thiết lập")).toBeTruthy();
		expect(within(row).getByText("2.000.000đ")).toBeTruthy();
		expect(within(row).getByText("—")).toBeTruthy();
	});

	it("unlinkedPaid > 0 hiện ghi chú hóa đơn không gắn lớp; = 0 không hiện", () => {
		const { rerender } = render(
			<StudentTuitionSummary
				summary={baseSummary({
					countedClasses: 1,
					totalFee: 10000000,
					unlinkedPaid: 500000,
				})}
			/>,
		);
		expect(
			screen.getByText(/Ngoài ra đã thu 500\.000đ từ hóa đơn không gắn lớp/),
		).toBeTruthy();

		rerender(
			<StudentTuitionSummary
				summary={baseSummary({
					countedClasses: 1,
					totalFee: 10000000,
				})}
			/>,
		);
		expect(screen.queryByText(/hóa đơn không gắn lớp/)).toBeNull();
	});

	it("countedClasses 0 nhưng có lớp → 3 thẻ '—' kèm dòng hướng dẫn", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "IELTS 6.5",
							enrollmentStatus: "active",
							fee: null,
							paid: 0,
							remaining: 0,
							overpaid: 0,
							counted: false,
						},
					],
				})}
			/>,
		);
		expect(statValue("Tổng học phí (VND)")).toBe("—");
		expect(statValue("Đã đóng (VND)")).toBe("—");
		expect(statValue("Còn lại (VND)")).toBe("—");
		expect(
			screen.getByText(
				"Chưa lớp nào được thiết lập học phí. Thiết lập ở trang lớp.",
			),
		).toBeTruthy();
	});

	it("học viên không có lớp nào → thông điệp 'Chưa tham gia lớp học nào.', không có bảng", () => {
		render(<StudentTuitionSummary summary={baseSummary()} />);
		expect(screen.getByText("Chưa tham gia lớp học nào.")).toBeTruthy();
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("lớp removed hiện badge 'Đã rời lớp', hiển thị nợ còn lại / 'Đã đóng đủ', và ghi chú phù hợp khi không còn lớp active", () => {
		render(
			<StudentTuitionSummary
				summary={baseSummary({
					classes: [
						{
							classId: "C1",
							className: "IELTS Rời",
							enrollmentStatus: "removed",
							fee: 10_000_000,
							paid: 500_000,
							remaining: 1_500_000,
							overpaid: 0,
							counted: false,
						},
						{
							classId: "C2",
							className: "IELTS Đủ",
							enrollmentStatus: "removed",
							fee: 6_000_000,
							paid: 2_000_000,
							remaining: 0,
							overpaid: 0,
							counted: false,
						},
					],
				})}
			/>,
		);
		const row1 = screen.getByRole("row", { name: /IELTS Rời/ });
		expect(within(row1).getByText("Đã rời lớp")).toBeTruthy();
		expect(within(row1).queryByText("Đã mời")).toBeNull();
		expect(within(row1).getByText("1.500.000đ")).toBeTruthy();

		const row2 = screen.getByRole("row", { name: /IELTS Đủ/ });
		expect(within(row2).getByText("Đã rời lớp")).toBeTruthy();
		expect(within(row2).getByText("Đã đóng đủ")).toBeTruthy();

		expect(
			screen.getByText(/Học viên hiện không còn lớp đang học/),
		).toBeTruthy();
	});
});
