// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repos = vi.hoisted(() => ({
	deleteHoliday: vi.fn(),
}));
vi.mock("@/lib/repos/holidays", () => repos);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { HolidayUndoDialog } from "./holiday-undo-dialog";

const SHIFT_HOLIDAY = {
	id: "hol-shift",
	name: "Nghỉ lễ 20/11",
	fromDate: "2026-11-20",
	toDate: "2026-11-20",
	scope: "org" as const,
	mode: "shift" as const,
};

const CANCEL_HOLIDAY = {
	id: "hol-cancel",
	name: "Nghỉ bảo trì",
	fromDate: "2026-11-27",
	toDate: "2026-11-27",
	scope: "org" as const,
	mode: "cancel" as const,
};

beforeEach(() => {
	repos.deleteHoliday.mockReset().mockResolvedValue({
		restoredCount: 2,
		removedMakeupCount: 2,
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("HolidayUndoDialog (TOS-13 phase 3)", () => {
	it("hiển thị tên kỳ nghỉ, khoảng ngày và tóm tắt Khôi phục N buổi gốc · Thu hồi M buổi bù (D8)", () => {
		render(
			<HolidayUndoDialog
				holiday={SHIFT_HOLIDAY}
				shifts={[
					{
						holidayId: "hol-shift",
						classId: "cl-1",
						originalDate: "2026-11-20",
						makeupDate: "2027-01-22",
					},
					{
						holidayId: "hol-shift",
						classId: "cl-2",
						originalDate: "2026-11-20",
						makeupDate: "2027-01-23",
					},
				]}
				classes={[
					{ id: "cl-1", name: "IELTS Writing" },
					{ id: "cl-2", name: "IELTS Speaking" },
				]}
				onClose={vi.fn()}
				onUndone={vi.fn()}
			/>,
		);

		expect(screen.getByText("Nghỉ lễ 20/11")).toBeTruthy();
		expect(screen.getByText(/Khoảng ngày: 20\/11/)).toBeTruthy();
		expect(screen.getByTestId("holiday-undo-summary").textContent).toBe(
			"Khôi phục 2 buổi gốc · Thu hồi 2 buổi bù",
		);
	});

	it("mode cancel hiển thị Khôi phục N buổi đã hủy và xác nhận gọi deleteHoliday", async () => {
		const onClose = vi.fn();
		const onUndone = vi.fn();
		repos.deleteHoliday.mockResolvedValueOnce({
			restoredCount: 1,
			removedMakeupCount: 0,
		});

		render(
			<HolidayUndoDialog
				holiday={CANCEL_HOLIDAY}
				cancels={[
					{
						holidayId: "hol-cancel",
						classId: "cl-1",
						date: "2026-11-27",
					},
				]}
				onClose={onClose}
				onUndone={onUndone}
			/>,
		);

		expect(screen.getByTestId("holiday-undo-summary").textContent).toBe(
			"Khôi phục 1 buổi đã hủy",
		);

		fireEvent.click(screen.getByTestId("holiday-undo-confirm"));
		await waitFor(() =>
			expect(repos.deleteHoliday).toHaveBeenCalledWith("hol-cancel"),
		);
		expect(toast.success).toHaveBeenCalledWith(
			"Đã xóa kỳ nghỉ «Nghỉ bảo trì»: khôi phục 1 buổi.",
		);
		expect(onUndone).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});

	it("409 makeup-touched hiện danh sách buổi bù đã bị đụng và giữ nguyên hộp thoại mở", async () => {
		const onClose = vi.fn();
		const onUndone = vi.fn();
		repos.deleteHoliday.mockRejectedValueOnce(
			Object.assign(new Error("makeup-touched"), {
				holidayErrorCode: "makeup-touched",
				status: 409,
				touched: [{ classId: "cl-1", makeupDate: "2027-01-22" }],
			}),
		);

		render(
			<HolidayUndoDialog
				holiday={SHIFT_HOLIDAY}
				shifts={[
					{
						holidayId: "hol-shift",
						classId: "cl-1",
						originalDate: "2026-11-20",
						makeupDate: "2027-01-22",
					},
				]}
				classes={[{ id: "cl-1", name: "IELTS Writing" }]}
				onClose={onClose}
				onUndone={onUndone}
			/>,
		);

		fireEvent.click(screen.getByTestId("holiday-undo-confirm"));
		await waitFor(() =>
			expect(screen.getByTestId("holiday-undo-touched")).toBeTruthy(),
		);
		expect(screen.getByTestId("holiday-undo-touched").textContent).toContain(
			"IELTS Writing — Buổi bù 22/01",
		);
		expect(onClose).not.toHaveBeenCalled();
		expect(onUndone).not.toHaveBeenCalled();
	});

	it("422 holiday-started hiện thông báo Kỳ nghỉ đã bắt đầu", async () => {
		const onClose = vi.fn();
		repos.deleteHoliday.mockRejectedValueOnce(
			Object.assign(new Error("holiday-started"), {
				holidayErrorCode: "holiday-started",
				status: 422,
			}),
		);

		render(
			<HolidayUndoDialog
				holiday={SHIFT_HOLIDAY}
				onClose={onClose}
				onUndone={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByTestId("holiday-undo-confirm"));
		await waitFor(() =>
			expect(screen.getByTestId("holiday-undo-error")).toBeTruthy(),
		);
		expect(screen.getByTestId("holiday-undo-error").textContent).toContain(
			"Kỳ nghỉ đã bắt đầu",
		);
		expect(onClose).not.toHaveBeenCalled();
	});
});
