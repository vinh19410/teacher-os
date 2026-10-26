// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { DailyAttendanceSession } from "@/lib/attendance-draft";
import { AttendanceSessionRow } from "./attendance-session-row";

// Vitest hoists vi.mock above top-level imports, so the factory must load router-mock dynamically.
vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

afterEach(() => {
	cleanup();
});

const DATED_SESSION: DailyAttendanceSession = {
	classId: "cls-1",
	className: "IELTS 6.5A",
	time: "18:00",
	dur: 90,
	mode: "dated",
	recorded: false,
	students: [
		{
			lessonId: "l-1",
			studentId: "s-1",
			studentName: "Nguyễn Minh Anh",
			attendance: null,
			note: "",
		},
		{
			lessonId: "l-2",
			studentId: "s-2",
			studentName: "Trần Hoàng Nam",
			attendance: null,
			note: "",
		},
	],
};

describe("AttendanceSessionRow", () => {
	test("mở hàng thì thấy đủ học viên và 4 lựa chọn với nhãn tiếng Việt chuẩn; phím mũi tên đổi trạng thái", () => {
		const onSave = vi.fn();
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		expect(screen.getByText(/18:00 – 19:30/)).toBeTruthy();
		expect(screen.getByText(/IELTS 6.5A/)).toBeTruthy();
		expect(screen.getByText(/Sĩ số 2 HV/)).toBeTruthy();

		const group1 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		expect(within(group1).getByRole("radio", { name: "Có mặt" })).toBeTruthy();
		expect(
			within(group1).getByRole("radio", { name: "Vắng có phép" }),
		).toBeTruthy();
		expect(
			within(group1).getByRole("radio", { name: "Vắng không phép" }),
		).toBeTruthy();
		expect(within(group1).getByRole("radio", { name: "Đi muộn" })).toBeTruthy();

		// Phím mũi tên đổi lựa chọn trong radiogroup.
		const presentRadio = within(group1).getByRole("radio", { name: "Có mặt" });
		fireEvent.click(presentRadio);
		expect(presentRadio.getAttribute("aria-checked")).toBe("true");

		fireEvent.keyDown(presentRadio, { key: "ArrowRight" });
		const excusedRadio = within(group1).getByRole("radio", {
			name: "Vắng có phép",
		});
		expect(excusedRadio.getAttribute("aria-checked")).toBe("true");
	});

	test("bấm lưu khi còn học viên chưa chọn trạng thái -> mở modal xác nhận; quay lại chỉnh thì không gọi onSave, hiện cảnh báo thiếu và focus dòng thiếu đầu tiên", () => {
		const onSave = vi.fn();
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		const group1 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group1).getByRole("radio", { name: "Có mặt" }));

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);

		// TOS-8 D2: ca chưa recorded còn thiếu -> modal xác nhận, không chặn im lặng.
		const dialog = screen.getByRole("dialog", {
			name: "Còn 1 học viên chưa chọn trạng thái",
		});
		expect(dialog.textContent).toContain(
			"Gán Có mặt cho 1 học viên này rồi lưu điểm danh ca học?",
		);
		expect(onSave).not.toHaveBeenCalled();

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Quay lại chỉnh" }),
		);

		expect(onSave).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toContain(
			"Còn 1 học viên chưa chọn trạng thái",
		);
		// Focus dòng thiếu ĐẦU TIÊN (Trần Hoàng Nam — l-2) SAU khi modal đóng
		// (cleanup của Modal trả focus về nút lưu — kongming điều kiện 3).
		const group2 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Trần Hoàng Nam/,
		});
		expect(document.activeElement).toBe(
			within(group2).getByRole("radio", { name: "Có mặt" }),
		);
	});

	test("Esc đóng modal = quay lại chỉnh: không gọi onSave, hiện cảnh báo thiếu và focus dòng thiếu", () => {
		const onSave = vi.fn();
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);
		expect(screen.getByRole("dialog")).toBeTruthy();

		fireEvent.keyDown(document, { key: "Escape" });

		expect(onSave).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.getByRole("alert").textContent).toContain(
			"Còn 2 học viên chưa chọn trạng thái",
		);
		const group1 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		expect(document.activeElement).toBe(
			within(group1).getByRole("radio", { name: "Có mặt" }),
		);
	});

	test("dòng attendance: null ở ca đã recorded hiển thị 'Chưa rõ (điểm danh cũ)' và chặn lưu cho đến khi chọn", () => {
		const onSave = vi.fn();
		const sessionWithUnknown: DailyAttendanceSession = {
			...DATED_SESSION,
			recorded: true,
			students: [
				{
					lessonId: "l-1",
					studentId: "s-1",
					studentName: "Nguyễn Minh Anh",
					attendance: "present",
					note: "",
				},
				{
					lessonId: "l-2",
					studentId: "s-2",
					studentName: "Trần Hoàng Nam",
					attendance: null,
					note: "",
				},
			],
		};

		render(
			<AttendanceSessionRow
				session={sessionWithUnknown}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		expect(screen.getByText("Chưa rõ (điểm danh cũ)")).toBeTruthy();

		// TOS-8 D1 + red-team #5: ca đã recorded còn "Chưa rõ" -> nút điền
		// nhanh disabled và bấm lưu KHÔNG mở modal bulk (giữ đường TOS-7).
		expect(
			screen
				.getByRole("button", { name: "Đánh dấu tất cả Có mặt" })
				.hasAttribute("disabled"),
		).toBe(true);

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);
		expect(onSave).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.getByRole("alert").textContent).toContain(
			"Còn 1 học viên chưa chọn trạng thái",
		);
	});

	test("chọn đủ trạng thái và nhập ghi chú rồi lưu -> onSave nhận đúng entries đã trim", () => {
		const onSave = vi.fn();
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		const group1 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		const group2 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Trần Hoàng Nam/,
		});

		fireEvent.click(within(group1).getByRole("radio", { name: "Có mặt" }));
		fireEvent.click(within(group2).getByRole("radio", { name: "Đi muộn" }));

		const note2 = screen.getByLabelText("Ghi chú học vụ của Trần Hoàng Nam");
		fireEvent.change(note2, { target: { value: "  Vào trễ 15 phút  " } });

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);

		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave).toHaveBeenCalledWith([
			{ lessonId: "l-1", attendance: "present", note: "" },
			{ lessonId: "l-2", attendance: "late", note: "Vào trễ 15 phút" },
		]);
	});

	test("ca legacy không render radio, hiện nhãn 'Lớp chưa gắn lịch ngày' và link sang trang lớp", () => {
		const legacySession: DailyAttendanceSession = {
			classId: "cls-legacy",
			className: "Lớp Giao Tiếp Cũ",
			time: "08:00",
			dur: 90,
			mode: "legacy",
			recorded: false,
			students: [
				{
					lessonId: null,
					studentId: "s-leg",
					studentName: "Lê Thu Hà",
					attendance: null,
					note: "",
				},
			],
		};

		render(
			<AttendanceSessionRow
				session={legacySession}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={() => {}}
			/>,
		);

		expect(screen.queryByRole("radiogroup")).toBeNull();
		expect(
			screen.getAllByText(/Lớp chưa gắn lịch ngày/).length,
		).toBeGreaterThan(0);
		// TOS-8 D1: lớp legacy không render nút điền nhanh.
		expect(
			screen.queryByRole("button", { name: "Đánh dấu tất cả Có mặt" }),
		).toBeNull();
		const link = screen.getByRole("link", {
			name: /Mở lớp để điểm danh/,
		});
		expect(link.getAttribute("href")).toBe("/classes/cls-legacy");
	});

	test("TOS-8: bấm Đánh dấu tất cả Có mặt điền present cho ô trống, giữ lựa chọn có sẵn", () => {
		const onSave = vi.fn();
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		const group1 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group1).getByRole("radio", { name: "Đi muộn" }));

		fireEvent.click(
			screen.getByRole("button", { name: "Đánh dấu tất cả Có mặt" }),
		);

		expect(
			within(group1)
				.getByRole("radio", { name: "Đi muộn" })
				.getAttribute("aria-checked"),
		).toBe("true");
		const group2 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Trần Hoàng Nam/,
		});
		expect(
			within(group2)
				.getByRole("radio", { name: "Có mặt" })
				.getAttribute("aria-checked"),
		).toBe("true");
	});

	test("TOS-8: nút điền nhanh disabled khi đủ trạng thái, khi ca đã recorded và khi ngày tương lai", () => {
		const bulkButton = () =>
			screen.getByRole("button", { name: "Đánh dấu tất cả Có mặt" });
		const first = render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={vi.fn()}
			/>,
		);

		expect(bulkButton().hasAttribute("disabled")).toBe(false);
		fireEvent.click(bulkButton());
		expect(bulkButton().hasAttribute("disabled")).toBe(true);

		first.unmount();
		render(
			<AttendanceSessionRow
				session={{ ...DATED_SESSION, recorded: true }}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={vi.fn()}
			/>,
		);
		expect(bulkButton().hasAttribute("disabled")).toBe(true);
	});

	test("TOS-8: nút điền nhanh disabled khi ngày tương lai", () => {
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={true}
				onSave={vi.fn()}
			/>,
		);
		expect(
			screen
				.getByRole("button", { name: "Đánh dấu tất cả Có mặt" })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	test("TOS-8: 'Gán Có mặt và lưu' gọi onSave với đủ entries present (entries tính từ helper, không crash)", () => {
		const onSave = vi.fn();
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Gán Có mặt và lưu" }));

		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave).toHaveBeenCalledWith([
			{ lessonId: "l-1", attendance: "present", note: "" },
			{ lessonId: "l-2", attendance: "present", note: "" },
		]);
	});

	test("TOS-8: đang lưu thì cả hai nút modal disabled (chặn double-submit)", () => {
		const onSave = vi.fn();
		const view = render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={onSave}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);
		const dialog = screen.getByRole("dialog");

		view.rerender(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				saving={true}
				onSave={onSave}
			/>,
		);

		expect(
			within(dialog)
				.getByRole("button", { name: "Đang lưu…" })
				.hasAttribute("disabled"),
		).toBe(true);
		expect(
			within(dialog)
				.getByRole("button", { name: "Quay lại chỉnh" })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	test("TOS-8: autoFocusBulk focus picker đầu tiên và báo settled để route xoá cờ", () => {
		const onBulkFocusSettled = vi.fn();
		render(
			<AttendanceSessionRow
				session={DATED_SESSION}
				expanded={true}
				onToggle={() => {}}
				isFutureDate={false}
				onSave={vi.fn()}
				autoFocusBulk={true}
				onBulkFocusSettled={onBulkFocusSettled}
			/>,
		);

		const firstRadio = within(
			screen.getByRole("radiogroup", {
				name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
			}),
		).getByRole("radio", { name: "Có mặt" });
		expect(document.activeElement).toBe(firstRadio);
		expect(onBulkFocusSettled).toHaveBeenCalledTimes(1);
	});
});
