// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

	test("bấm lưu khi còn học viên chưa chọn trạng thái -> không gọi onSave, hiện thông báo thiếu và tô cảnh báo", () => {
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

		expect(onSave).not.toHaveBeenCalled();
		expect(screen.getByRole("alert").textContent).toContain(
			"Còn 1 học viên chưa chọn trạng thái",
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

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);
		expect(onSave).not.toHaveBeenCalled();
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
		expect(screen.getAllByText(/Lớp chưa gắn lịch ngày/).length).toBeGreaterThan(
			0,
		);
		const link = screen.getByRole("link", {
			name: /Mở lớp để điểm danh/,
		});
		expect(link.getAttribute("href")).toBe("/classes/cls-legacy");
	});
});
