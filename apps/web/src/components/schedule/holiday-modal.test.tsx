// @vitest-environment jsdom

import type { HolidayPreview } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repos = vi.hoisted(() => ({
	previewHoliday: vi.fn(),
	applyHoliday: vi.fn(),
}));
vi.mock("@/lib/repos/holidays", () => repos);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { HolidayModal } from "./holiday-modal";

const PREVIEW: HolidayPreview = {
	shifts: [
		{
			classId: "cl-1",
			className: "IELTS Writing",
			originalDate: "2026-11-20",
			sessionOrdinal: 3,
			makeupDate: "2027-01-22",
			time: "19:00",
			dur: 90,
			weekday: 5,
			skippedHolidayDates: [],
		},
	],
	keptCompleted: [],
	unsupported: [],
	affectedClassCount: 1,
	planHash: "hash-1",
};

const CLASSES = [{ id: "cl-1", name: "IELTS Writing" }];

function fillValidForm() {
	fireEvent.change(screen.getByTestId("holiday-name"), {
		target: { value: "Nghỉ lễ 20/11" },
	});
	fireEvent.change(screen.getByTestId("holiday-from"), {
		target: { value: "2026-11-20" },
	});
	fireEvent.change(screen.getByTestId("holiday-to"), {
		target: { value: "2026-11-20" },
	});
}

beforeEach(() => {
	repos.previewHoliday.mockReset().mockResolvedValue(PREVIEW);
	repos.applyHoliday.mockReset().mockResolvedValue({
		holidayId: "hol-1",
		shiftedCount: 1,
		classCount: 1,
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

/** Chờ debounce 300ms chạy thật (test không fake timers để waitFor sống). */
const settle = (): Promise<void> => {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, 400);
	return promise;
};

describe("HolidayModal (TOS-11 phase 5)", () => {
	it("khóa xác nhận khi tên 1 ký tự — lỗi inline", () => {
		render(
			<HolidayModal
				open
				classes={CLASSES}
				onClose={vi.fn()}
				onApplied={vi.fn()}
			/>,
		);
		fireEvent.change(screen.getByTestId("holiday-name"), {
			target: { value: "N" },
		});
		expect(screen.getByText(/Tên từ 2–100 ký tự/)).toBeTruthy();
		expect(
			(screen.getByText("Xác nhận áp dụng & Dời buổi") as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("gọi preview debounce 300ms với draft hợp lệ và render ngày bù", async () => {
		render(
			<HolidayModal
				open
				classes={CLASSES}
				onClose={vi.fn()}
				onApplied={vi.fn()}
			/>,
		);
		fillValidForm();
		expect(repos.previewHoliday).not.toHaveBeenCalled();
		await waitFor(() => expect(repos.previewHoliday).toHaveBeenCalled(), {
			timeout: 1500,
		});
		await waitFor(() =>
			expect(screen.getByTestId("holiday-preview")).toBeTruthy(),
		);
		expect(repos.previewHoliday).toHaveBeenCalledWith({
			name: "Nghỉ lễ 20/11",
			fromDate: "2026-11-20",
			toDate: "2026-11-20",
			scope: "org",
			classIds: [],
			mode: "shift",
			notify: true,
		});
		expect(
			screen.getAllByText(/Dời sang Thứ 6, 22\/01/).length,
		).toBeGreaterThanOrEqual(1); // bảng desktop + thẻ mobile
		expect(screen.getAllByText(/Buổi 3/).length).toBeGreaterThanOrEqual(1);
	});

	it("khoảng 31 ngày → lỗi inline + không gọi preview", async () => {
		render(
			<HolidayModal
				open
				classes={CLASSES}
				onClose={vi.fn()}
				onApplied={vi.fn()}
			/>,
		);
		fireEvent.change(screen.getByTestId("holiday-name"), {
			target: { value: "Nghỉ dài" },
		});
		fireEvent.change(screen.getByTestId("holiday-from"), {
			target: { value: "2026-11-01" },
		});
		fireEvent.change(screen.getByTestId("holiday-to"), {
			target: { value: "2026-12-01" },
		});
		await settle();
		expect(repos.previewHoliday).not.toHaveBeenCalled();
		// Cả hai ô ngày cùng báo lỗi — lấy phần tử đầu.
		expect(screen.getAllByText(/tối đa 30 ngày/).length).toBeGreaterThanOrEqual(
			1,
		);
	});

	it("khoảng 35 ngày → nút xác nhận khóa, không gọi preview; sửa về 30 ngày → mở khóa (AC-004 mục 2, #453)", async () => {
		render(
			<HolidayModal
				open
				classes={CLASSES}
				onClose={vi.fn()}
				onApplied={vi.fn()}
			/>,
		);
		fireEvent.change(screen.getByTestId("holiday-name"), {
			target: { value: "Nghỉ đông" },
		});
		// 2026-11-01..2026-12-05 tính cả hai đầu = 35 ngày.
		fireEvent.change(screen.getByTestId("holiday-from"), {
			target: { value: "2026-11-01" },
		});
		fireEvent.change(screen.getByTestId("holiday-to"), {
			target: { value: "2026-12-05" },
		});
		await settle();
		expect(screen.getAllByText(/tối đa 30 ngày/).length).toBeGreaterThanOrEqual(
			1,
		);
		expect(
			(screen.getByText("Xác nhận áp dụng & Dời buổi") as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(repos.previewHoliday).not.toHaveBeenCalled();

		// Sửa về đúng 30 ngày (2026-11-01..2026-11-30) → mở khóa + preview chạy.
		fireEvent.change(screen.getByTestId("holiday-to"), {
			target: { value: "2026-11-30" },
		});
		const confirmBtn = screen.getByText(
			"Xác nhận áp dụng & Dời buổi",
		) as HTMLButtonElement;
		await waitFor(() => expect(confirmBtn.disabled).toBe(false), {
			timeout: 2000,
		});
		await waitFor(() => expect(repos.previewHoliday).toHaveBeenCalled(), {
			timeout: 2000,
		});
	});

	it("scope = classes mà chưa chọn lớp → lỗi và không preview", async () => {
		render(
			<HolidayModal
				open
				classes={CLASSES}
				onClose={vi.fn()}
				onApplied={vi.fn()}
			/>,
		);
		fillValidForm();
		fireEvent.click(screen.getByLabelText("Chọn lớp học cụ thể"));
		await settle();
		expect(repos.previewHoliday).not.toHaveBeenCalled();
		expect(screen.getByText("Chọn ít nhất một lớp")).toBeTruthy();
	});

	it("xác nhận gọi apply kèm planHash và toast thành công", async () => {
		const onApplied = vi.fn();
		const onClose = vi.fn();
		render(
			<HolidayModal
				open
				classes={CLASSES}
				onClose={onClose}
				onApplied={onApplied}
			/>,
		);
		fillValidForm();
		await waitFor(() =>
			expect(screen.getByTestId("holiday-preview")).toBeTruthy(),
		);
		fireEvent.click(screen.getByText("Xác nhận áp dụng & Dời buổi"));
		await waitFor(() => expect(onApplied).toHaveBeenCalledWith(1));
		expect(repos.applyHoliday).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Nghỉ lễ 20/11" }),
			"hash-1",
		);
		expect(toast.success).toHaveBeenCalled();
		expect(onClose).toHaveBeenCalled();
	});

	it("409 stale-preview → toast + gọi lại preview", async () => {
		repos.applyHoliday.mockRejectedValueOnce(
			Object.assign(new Error("stale-preview"), {
				holidayErrorCode: "stale-preview",
			}),
		);
		render(
			<HolidayModal
				open
				classes={CLASSES}
				onClose={vi.fn()}
				onApplied={vi.fn()}
			/>,
		);
		fillValidForm();
		await waitFor(() =>
			expect(screen.getByTestId("holiday-preview")).toBeTruthy(),
		);
		fireEvent.click(screen.getByText("Xác nhận áp dụng & Dời buổi"));
		await waitFor(() => expect(toast.error).toHaveBeenCalled());
		await waitFor(() => expect(repos.previewHoliday).toHaveBeenCalledTimes(2));
	});
});
