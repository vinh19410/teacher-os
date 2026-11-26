// @vitest-environment jsdom

import { CLASS_ERROR_CODES } from "@teacher-os/api/contracts";
import {
	addDaysISO,
	formatViDateDisplay,
	formatViWeekdayDate,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassGroup, Student } from "@/lib/mock-data";

const toastMock = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
	warning: vi.fn(),
}));
const reauthMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));

import {
	buildSuccessToast,
	ConfirmOpeningModal,
	type OpeningRosterEntry,
} from "./confirm-opening-modal";

const futureDate = addDaysISO(vietnamTodayISO(), 10);
const laterFutureDate = addDaysISO(vietnamTodayISO(), 20);
const pastDate = addDaysISO(vietnamTodayISO(), -5);

function makeStudent(overrides: Partial<Student> = {}): Student {
	return {
		id: "st-1",
		name: "Nguyễn Minh Anh",
		phone: "0912345678",
		zalo: "",
		email: "minhanh@example.com",
		hasPackage: false,
		parent: { name: "", phone: "" },
		targetBand: "7.0",
		skills: ["Writing"],
		examDate: "",
		pkg: {
			total: 0,
			done: 0,
			remaining: 0,
			price: 0,
			mode: "Online",
			start: "",
			expiry: "",
		},
		tags: [],
		notes: "",
		avatar: "MA",
		atRisk: false,
		...overrides,
	};
}

function makeClassGroup(overrides: Partial<ClassGroup> = {}): ClassGroup {
	return {
		id: "cl-1",
		name: "IELTS Writing 7.0",
		level: "Band 7.0",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: "",
		studentIds: ["st-1"],
		invitedStudentIds: ["st-2"],
		schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}',
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: futureDate,
		tuitionFee: 3_500_000,
		notes: "",
		schedulingMode: "auto",
		openingConfirmedAt: null,
		openingNote: "",
		openingAnnouncementVersion: 0,
		openingNotifiedStudentIds: [],
		...overrides,
	};
}

function makeDefaultRoster(): OpeningRosterEntry[] {
	return [
		{
			student: makeStudent({
				id: "st-1",
				name: "Nguyễn Minh Anh",
				email: "minhanh@example.com",
			}),
			isInvited: false,
		},
		{
			student: makeStudent({
				id: "st-2",
				name: "Trần Gia Bảo",
				email: "giabao@example.com",
			}),
			isInvited: true,
		},
		{
			student: makeStudent({
				id: "st-3",
				name: "Lê Thu Hà",
				email: "",
			}),
			isInvited: false,
		},
	];
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

beforeEach(() => {
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	toastMock.warning.mockReset();
	reauthMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ConfirmOpeningModal", () => {
	it("renders editable date picker, active and invited counts, missing-email warning, and live HTML preview iframe", () => {
		const cls = makeClassGroup();
		const roster = makeDefaultRoster();

		render(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={cls}
				hasRealSessions={false}
				roster={roster}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		const dialog = screen.getByRole("dialog", {
			name: "Chốt khai giảng — IELTS Writing 7.0",
		});

		const dateInput = within(dialog).getByLabelText(
			/Ngày khai giảng/,
		) as HTMLInputElement;
		expect(dateInput.value).toBe(formatViDateDisplay(futureDate));

		expect(dialog.textContent).toContain(
			"Sẽ gửi email đến 2 học viên (1 Đang học · 1 Đã mời)",
		);
		const missingWarning = within(dialog).getByTestId(
			"opening-missing-email-warning",
		);
		expect(missingWarning.textContent).toContain(
			"1 học viên chưa có email sẽ không nhận được email (vẫn nhận thông báo trong cổng học viên): Lê Thu Hà",
		);

		const toggleBtn = within(dialog).getByRole("button", {
			name: "Xem trước Email HTML",
		});
		expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

		const iframe = within(dialog).getByTitle(
			"Xem trước email thông báo khai giảng",
		) as HTMLIFrameElement;
		expect(iframe.getAttribute("sandbox")).toBe("");
		expect(iframe.getAttribute("srcdoc")).toContain("IELTS Writing 7.0");
		expect(iframe.getAttribute("srcdoc")).toContain("Nguyễn Minh Anh");

		const noteInput = within(dialog).getByLabelText(
			"Lời nhắn cho học viên (tùy chọn)",
		);
		fireEvent.change(noteInput, {
			target: { value: "Mang theo sổ ghi chép và tham gia nhóm Zalo" },
		});
		expect(iframe.getAttribute("srcdoc")).toContain(
			"Mang theo sổ ghi chép và tham gia nhóm Zalo",
		);

		fireEvent.click(toggleBtn);
		expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
		expect(
			within(dialog).queryByTitle("Xem trước email thông báo khai giảng"),
		).toBeNull();
	});

	it("truncates missing-email warning list after 5 students", () => {
		const missingRoster: OpeningRosterEntry[] = Array.from(
			{ length: 7 },
			(_, idx) => ({
				student: makeStudent({
					id: `st-${idx + 1}`,
					name: `Học viên ${idx + 1}`,
					email: "",
				}),
				isInvited: false,
			}),
		);

		render(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={makeClassGroup()}
				hasRealSessions={false}
				roster={missingRoster}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		const warning = screen.getByTestId("opening-missing-email-warning");
		expect(warning.textContent).toContain(
			"7 học viên chưa có email sẽ không nhận được email (vẫn nhận thông báo trong cổng học viên): Học viên 1, Học viên 2, Học viên 3, Học viên 4, Học viên 5 và 2 học viên khác",
		);
	});

	it("shows read-only opening date and omits startDate from payload when class has real sessions", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				openingConfirmedAt: "2026-11-24T06:00:00.000Z",
				openingAnnouncementVersion: 1,
				startDate: futureDate,
				openingNote: "",
				queuedEmailCount: 2,
				inAppOnlyCount: 0,
				skippedNoEmail: [],
				skippedAlreadySentCount: 0,
				notifiedStudentIds: ["st-1", "st-2"],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();

		render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup()}
				hasRealSessions
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={onConfirmed}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).queryByLabelText(/Ngày khai giảng/)).toBeNull();
		expect(
			within(dialog).getByTestId("opening-date-readonly").textContent,
		).toContain(formatViWeekdayDate(futureDate));
		expect(
			within(dialog).getByTestId("opening-date-locked-note").textContent,
		).toContain("Lớp đã bắt đầu học nên ngày khai giảng được giữ cố định.");

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Chốt & gửi 2 email" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onConfirmed).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(JSON.parse(String(init.body))).toEqual({
			mode: "initial",
			note: "",
			expectedVersion: 0,
		});
	});

	it("submits initial confirmation with exact payload, calls onConfirmed, shows toast, and closes modal", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				openingConfirmedAt: "2026-11-24T06:00:00.000Z",
				openingAnnouncementVersion: 1,
				startDate: futureDate,
				openingNote: "Vào phòng Zoom trước 10 phút",
				queuedEmailCount: 2,
				inAppOnlyCount: 1,
				skippedNoEmail: [{ studentId: "st-3", studentName: "Lê Thu Hà" }],
				skippedAlreadySentCount: 0,
				notifiedStudentIds: ["st-1", "st-2", "st-3"],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();

		render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup()}
				hasRealSessions={false}
				roster={makeDefaultRoster()}
				onConfirmed={onConfirmed}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		fireEvent.change(
			within(dialog).getByLabelText("Lời nhắn cho học viên (tùy chọn)"),
			{
				target: { value: "  Vào phòng Zoom trước 10 phút  " },
			},
		);

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Chốt & gửi 2 email" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onConfirmed).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toContain("/api/classes/cl-1/confirm-opening");
		expect(init.method).toBe("POST");
		expect(init.credentials).toBe("include");
		expect(JSON.parse(String(init.body))).toEqual({
			mode: "initial",
			startDate: futureDate,
			note: "Vào phòng Zoom trước 10 phút",
			expectedVersion: 0,
		});
		expect(toastMock.success).toHaveBeenCalledWith(
			"Đã chốt khai giảng và đưa 2 email vào hàng đợi gửi. 1 học viên chưa có email chỉ nhận thông báo trong cổng học viên.",
		);
	});

	it("renders send-mode options for already-confirmed class, warns on all-class resend, and disables submit when new_only has 0 students", () => {
		const confirmedWithNew = makeClassGroup({
			openingConfirmedAt: "2026-11-20T02:30:00.000Z",
			openingAnnouncementVersion: 1,
			openingNotifiedStudentIds: ["st-1"],
		});
		const roster = makeDefaultRoster().slice(0, 2);

		const { rerender } = render(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={confirmedWithNew}
				hasRealSessions={false}
				roster={roster}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		const dialog = screen.getByRole("dialog", {
			name: "Thông báo khai giảng — IELTS Writing 7.0",
		});
		expect(dialog.textContent).toContain(
			"Đã chốt lần gần nhất: 20/11/2026 09:30",
		);

		const newOnlyRadio = within(dialog).getByRole("radio", {
			name: /Chỉ gửi cho học viên mới chưa nhận \(1\)/,
		}) as HTMLInputElement;
		const allRadio = within(dialog).getByRole("radio", {
			name: /Gửi thông báo cập nhật cho cả lớp \(2\)/,
		}) as HTMLInputElement;

		expect(newOnlyRadio.checked).toBe(true);
		expect(allRadio.checked).toBe(false);
		expect(within(dialog).queryByRole("note")).toBeNull();
		expect(
			within(dialog).getByRole("button", { name: "Gửi bổ sung (1 email)" }),
		).toBeTruthy();

		fireEvent.click(allRadio);
		expect(allRadio.checked).toBe(true);
		expect(within(dialog).getByRole("note").textContent).toContain(
			"Học viên đã nhận trước đó sẽ nhận thêm một email cập nhật lịch khai giảng.",
		);
		expect(
			within(dialog).getByRole("button", { name: "Gửi cập nhật (2 email)" }),
		).toBeTruthy();

		// When all students have already been notified, selecting new_only disables submit.
		const confirmedNoNew = makeClassGroup({
			id: "cl-2",
			openingConfirmedAt: "2026-11-20T02:30:00.000Z",
			openingAnnouncementVersion: 2,
			openingNotifiedStudentIds: ["st-1", "st-2"],
		});
		rerender(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={confirmedNoNew}
				hasRealSessions={false}
				roster={roster}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		const newOnlyZero = screen.getByRole("radio", {
			name: /Chỉ gửi cho học viên mới chưa nhận \(0\)/,
		}) as HTMLInputElement;
		const allWhenZero = screen.getByRole("radio", {
			name: /Gửi thông báo cập nhật cho cả lớp \(2\)/,
		}) as HTMLInputElement;
		expect(allWhenZero.checked).toBe(true);
		expect(screen.getByRole("dialog").textContent).toContain(
			"Tất cả học viên hiện tại đã nhận thông báo khai giảng.",
		);

		fireEvent.click(newOnlyZero);
		expect(newOnlyZero.checked).toBe(true);
		const submitBtn = screen.getByRole("button", {
			name: "Gửi bổ sung (0 email)",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);
	});

	it("validates past startDate on client without calling the API", () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		render(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={makeClassGroup()}
				hasRealSessions={false}
				roster={makeDefaultRoster()}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		const dateInput = within(dialog).getByLabelText(/Ngày khai giảng/);
		fireEvent.change(dateInput, {
			target: { value: formatViDateDisplay(pastDate) },
		});

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Chốt & gửi 2 email" }),
		);

		const alert = within(dialog).getByRole("alert");
		expect(alert.textContent).toContain(
			"Ngày khai giảng mới phải từ hôm nay trở đi.",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("shows alert and triggers refresh on 409 version conflict and paused errors", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(409, {
					error: "Thông tin khai giảng đã thay đổi bởi thao tác khác.",
					code: CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT,
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse(409, {
					error: "Lớp đang tạm dừng.",
					code: CLASS_ERROR_CODES.CLASS_PAUSED,
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();

		render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup()}
				hasRealSessions={false}
				roster={makeDefaultRoster()}
				onConfirmed={onConfirmed}
			/>,
		);

		const submitBtn = screen.getByRole("button", {
			name: "Chốt & gửi 2 email",
		});
		fireEvent.click(submitBtn);

		const conflictAlert = await screen.findByRole("alert");
		expect(conflictAlert.textContent).toContain(
			"Thông tin khai giảng đã thay đổi bởi thao tác khác.",
		);
		expect(onConfirmed).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();

		fireEvent.click(submitBtn);
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Lớp đang tạm dừng.",
			),
		);
		expect(onConfirmed).toHaveBeenCalledTimes(2);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("triggers reauth on 401 response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => jsonResponse(401, { error: "Unauthorized" })),
		);

		render(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={makeClassGroup()}
				hasRealSessions={false}
				roster={makeDefaultRoster()}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Chốt & gửi 2 email" }));

		await waitFor(() => expect(reauthMock).toHaveBeenCalledTimes(1));
		expect(screen.getByRole("alert")).toBeTruthy();
	});

	it("disables submit when startDate is empty and triggers refresh on CLASS_SCHEDULE_LOCKED", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(409, {
				error: "Lớp đã có buổi học thực tế nên không thể đổi ngày khai giảng.",
				code: CLASS_ERROR_CODES.SCHEDULE_LOCKED,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);

		const { rerender } = render(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={makeClassGroup({ startDate: "" })}
				hasRealSessions={false}
				roster={makeDefaultRoster()}
				onConfirmed={onConfirmed}
			/>,
		);

		const emptySubmitBtn = screen.getByRole("button", {
			name: "Chốt & gửi 2 email",
		}) as HTMLButtonElement;
		expect(emptySubmitBtn.disabled).toBe(true);

		rerender(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={makeClassGroup({ id: "cl-locked", startDate: futureDate })}
				hasRealSessions={false}
				roster={makeDefaultRoster()}
				onConfirmed={onConfirmed}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Chốt & gửi 2 email" }));
		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Lớp đã có buổi học thực tế");
		expect(onConfirmed).toHaveBeenCalledTimes(1);
	});

	it("locks startDate in new_only mode with switch guidance, unlocks in all mode, resets on switch back, and omits startDate in new_only payload", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				openingConfirmedAt: "2026-11-24T06:00:00.000Z",
				openingAnnouncementVersion: 2,
				startDate: futureDate,
				openingNote: "",
				queuedEmailCount: 1,
				inAppOnlyCount: 0,
				skippedNoEmail: [],
				skippedAlreadySentCount: 1,
				notifiedStudentIds: ["st-1", "st-2"],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();

		const confirmedWithNew = makeClassGroup({
			startDate: futureDate,
			openingConfirmedAt: "2026-11-20T02:30:00.000Z",
			openingAnnouncementVersion: 1,
			openingNotifiedStudentIds: ["st-1"],
		});

		render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={confirmedWithNew}
				hasRealSessions={false}
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={onConfirmed}
			/>,
		);

		const dialog = screen.getByRole("dialog");

		// Divider sits on the wrapper div above fieldset so top border never cuts through legend.
		const fieldset = dialog.querySelector("fieldset");
		expect(fieldset).toBeTruthy();
		expect(fieldset?.className).not.toContain("border-t");
		expect(fieldset?.parentElement?.className).toContain("border-t");

		// In default new_only mode, startDate is read-only with guidance to switch to "all".
		expect(within(dialog).queryByLabelText(/Ngày khai giảng/)).toBeNull();
		expect(
			within(dialog).getByTestId("opening-date-readonly").textContent,
		).toContain(formatViWeekdayDate(futureDate));
		expect(
			within(dialog).getByTestId("opening-date-locked-note").textContent,
		).toContain(
			'Chọn "Gửi thông báo cập nhật cho cả lớp" nếu cần thay đổi ngày khai giảng.',
		);

		// Switching to "all" makes startDate editable when there are no real sessions.
		const allRadio = within(dialog).getByRole("radio", {
			name: /Gửi thông báo cập nhật cho cả lớp \(2\)/,
		});
		const newOnlyRadio = within(dialog).getByRole("radio", {
			name: /Chỉ gửi cho học viên mới chưa nhận \(1\)/,
		});
		fireEvent.click(allRadio);

		const dateInput = within(dialog).getByLabelText(
			/Ngày khai giảng/,
		) as HTMLInputElement;
		expect(dateInput.value).toBe(formatViDateDisplay(futureDate));

		fireEvent.change(dateInput, {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});
		const iframe = within(dialog).getByTitle(
			"Xem trước email thông báo khai giảng",
		) as HTMLIFrameElement;
		expect(iframe.getAttribute("srcdoc")).toContain(
			formatViDateDisplay(laterFutureDate),
		);

		// Switching back to new_only resets startDate to cls.startDate and restores preview.
		fireEvent.click(newOnlyRadio);
		expect(within(dialog).queryByLabelText(/Ngày khai giảng/)).toBeNull();
		expect(
			within(dialog)
				.getByTitle("Xem trước email thông báo khai giảng")
				.getAttribute("srcdoc"),
		).toContain(formatViDateDisplay(futureDate));
		expect(
			within(dialog)
				.getByTitle("Xem trước email thông báo khai giảng")
				.getAttribute("srcdoc"),
		).not.toContain(formatViDateDisplay(laterFutureDate));

		// Re-entering "all" confirms the edited draft date was reset cleanly.
		fireEvent.click(allRadio);
		expect(
			(within(dialog).getByLabelText(/Ngày khai giảng/) as HTMLInputElement)
				.value,
		).toBe(formatViDateDisplay(futureDate));

		// Type an invalid date in "all" mode, then switch back to "new_only" and
		// verify startDateInvalid is cleared cleanly on submit and when re-entering "all".
		fireEvent.change(within(dialog).getByLabelText(/Ngày khai giảng/), {
			target: { value: "99/99" },
		});

		// Switch back to new_only and submit — payload must omit startDate.
		fireEvent.click(newOnlyRadio);
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Gửi bổ sung (1 email)" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		const sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;
		expect(sentBody).toEqual({
			mode: "new_only",
			note: "",
			expectedVersion: 1,
		});
		expect("startDate" in sentBody).toBe(false);
	});

	it("prioritizes real-sessions lock notice over new_only guidance when class has real sessions", () => {
		const confirmedWithNew = makeClassGroup({
			startDate: futureDate,
			openingConfirmedAt: "2026-11-20T02:30:00.000Z",
			openingAnnouncementVersion: 1,
			openingNotifiedStudentIds: ["st-1"],
		});

		render(
			<ConfirmOpeningModal
				open
				onClose={vi.fn()}
				cls={confirmedWithNew}
				hasRealSessions
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).getByTestId("opening-date-locked-note").textContent,
		).toContain("Lớp đã bắt đầu học nên ngày khai giảng được giữ cố định.");

		fireEvent.click(
			within(dialog).getByRole("radio", {
				name: /Gửi thông báo cập nhật cho cả lớp \(2\)/,
			}),
		);
		expect(within(dialog).queryByLabelText(/Ngày khai giảng/)).toBeNull();
		expect(
			within(dialog).getByTestId("opening-date-locked-note").textContent,
		).toContain("Lớp đã bắt đầu học nên ngày khai giảng được giữ cố định.");
	});

	it("allows editing startDate on unstarted class with real sessions in initial and all modes, keeps new_only read-only, and shows auto-reschedule note for auto classes", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				openingConfirmedAt: "2026-11-24T06:00:00.000Z",
				openingAnnouncementVersion: 1,
				startDate: laterFutureDate,
				openingNote: "",
				queuedEmailCount: 2,
				inAppOnlyCount: 0,
				skippedNoEmail: [],
				skippedAlreadySentCount: 0,
				notifiedStudentIds: ["st-1", "st-2"],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();

		render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup()}
				hasRealSessions
				isManual={false}
				startDateLocked={false}
				startDateLockReason={null}
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={onConfirmed}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		const dateInput = within(dialog).getByLabelText(
			/Ngày khai giảng/,
		) as HTMLInputElement;
		expect(dateInput.value).toBe(formatViDateDisplay(futureDate));

		fireEvent.change(dateInput, {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});
		expect(
			within(dialog).getByText(
				"Lịch các buổi học chưa diễn ra của lớp sẽ tự động cập nhật theo ngày khai giảng mới.",
			),
		).toBeTruthy();

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Chốt & gửi 2 email" }),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		const [, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(JSON.parse(String(init.body))).toEqual({
			mode: "initial",
			startDate: laterFutureDate,
			note: "",
			expectedVersion: 0,
		});

		// Already-confirmed unstarted class: new_only stays read-only, switching to all unlocks date.
		cleanup();
		const fetchAllMock = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				openingConfirmedAt: "2026-11-24T06:00:00.000Z",
				openingAnnouncementVersion: 2,
				startDate: laterFutureDate,
				openingNote: "",
				queuedEmailCount: 2,
				inAppOnlyCount: 0,
				skippedNoEmail: [],
				skippedAlreadySentCount: 0,
				notifiedStudentIds: ["st-1", "st-2"],
			}),
		);
		vi.stubGlobal("fetch", fetchAllMock);
		const onCloseAll = vi.fn();

		render(
			<ConfirmOpeningModal
				open
				onClose={onCloseAll}
				cls={makeClassGroup({
					openingConfirmedAt: "2026-11-20T02:30:00.000Z",
					openingAnnouncementVersion: 1,
					openingNotifiedStudentIds: ["st-1"],
				})}
				hasRealSessions
				isManual={false}
				startDateLocked={false}
				startDateLockReason={null}
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		const confirmedDialog = screen.getByRole("dialog");
		expect(
			within(confirmedDialog).queryByLabelText(/Ngày khai giảng/),
		).toBeNull();
		expect(
			within(confirmedDialog).getByTestId("opening-date-locked-note")
				.textContent,
		).toContain(
			'Chọn "Gửi thông báo cập nhật cho cả lớp" nếu cần thay đổi ngày khai giảng.',
		);

		fireEvent.click(
			within(confirmedDialog).getByRole("radio", {
				name: /Gửi thông báo cập nhật cho cả lớp \(2\)/,
			}),
		);
		const allDateInput =
			within(confirmedDialog).getByLabelText(/Ngày khai giảng/);
		fireEvent.change(allDateInput, {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});
		fireEvent.click(
			within(confirmedDialog).getByRole("button", {
				name: "Gửi cập nhật (2 email)",
			}),
		);
		await waitFor(() => expect(onCloseAll).toHaveBeenCalledTimes(1));
		const [, allInit] = fetchAllMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(JSON.parse(String(allInit.body))).toEqual({
			mode: "all",
			startDate: laterFutureDate,
			note: "",
			expectedVersion: 1,
		});
	});

	it("shows legacy lock reason copy and refreshes snapshot on 409 CLASS_START_DATE_LOCKED", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(409, {
				code: CLASS_ERROR_CODES.START_DATE_LOCKED,
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();

		const { rerender } = render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup()}
				hasRealSessions
				isManual={false}
				startDateLocked
				startDateLockReason="legacy-undated"
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={onConfirmed}
			/>,
		);

		expect(
			screen.getByTestId("opening-date-locked-note").textContent,
		).toContain("định dạng cũ hoặc đã điều chỉnh buổi lẻ");

		rerender(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup({ id: "cl-race" })}
				hasRealSessions
				isManual={false}
				startDateLocked={false}
				startDateLockReason={null}
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={onConfirmed}
			/>,
		);

		fireEvent.change(screen.getByLabelText(/Ngày khai giảng/), {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});
		fireEvent.click(screen.getByRole("button", { name: "Chốt & gửi 2 email" }));

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toBe(
			"Lớp đã bắt đầu học nên không thể đổi ngày khai giảng.",
		);
		expect(onConfirmed).toHaveBeenCalledTimes(1);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("submits form cleanly via Enter and footer type=submit button bound to form id", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				openingConfirmedAt: "2026-11-24T06:00:00.000Z",
				openingAnnouncementVersion: 1,
				startDate: futureDate,
				openingNote: "",
				queuedEmailCount: 2,
				inAppOnlyCount: 0,
				skippedNoEmail: [],
				skippedAlreadySentCount: 0,
				notifiedStudentIds: ["st-1", "st-2"],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();

		render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup()}
				hasRealSessions={false}
				roster={makeDefaultRoster().slice(0, 2)}
				onConfirmed={onConfirmed}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		const form = dialog.querySelector("form");
		expect(form).toBeTruthy();
		expect(form?.id).toBeTruthy();

		const submitBtn = within(dialog).getByRole("button", {
			name: "Chốt & gửi 2 email",
		}) as HTMLButtonElement;
		expect(submitBtn.type).toBe("submit");
		expect(submitBtn.getAttribute("form")).toBe(form?.id);

		const dateInput = within(dialog).getByLabelText(/Ngày khai giảng/);
		const enterNotPrevented = fireEvent.keyDown(dateInput, { key: "Enter" });
		expect(enterNotPrevented).toBe(true);

		fireEvent.submit(form as HTMLFormElement);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onConfirmed).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("synchronizes startDate, note, and sendMode when openingAnnouncementVersion refreshes after a 409 conflict while keeping the alert visible", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse(409, {
					error: "Thông tin khai giảng đã thay đổi bởi thao tác khác.",
					code: CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT,
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse(200, {
					ok: true,
					openingConfirmedAt: "2026-11-24T06:10:00.000Z",
					openingAnnouncementVersion: 2,
					startDate: laterFutureDate,
					openingNote: "Ghi chú đã cập nhật từ máy khác",
					queuedEmailCount: 1,
					inAppOnlyCount: 0,
					skippedNoEmail: [],
					skippedAlreadySentCount: 1,
					notifiedStudentIds: ["st-1", "st-2"],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);
		const onConfirmed = vi.fn(async () => undefined);
		const onClose = vi.fn();
		const roster = makeDefaultRoster().slice(0, 2);

		const { rerender } = render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup({ startDate: futureDate, openingNote: "" })}
				hasRealSessions={false}
				roster={roster}
				onConfirmed={onConfirmed}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		fireEvent.change(
			within(dialog).getByLabelText("Lời nhắn cho học viên (tùy chọn)"),
			{ target: { value: "Bản nháp cũ" } },
		);

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Chốt & gửi 2 email" }),
		);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain(
			"Thông tin khai giảng đã thay đổi bởi thao tác khác.",
		);
		expect(onConfirmed).toHaveBeenCalledTimes(1);

		const refreshedCls = makeClassGroup({
			startDate: laterFutureDate,
			openingConfirmedAt: "2026-11-24T06:00:00.000Z",
			openingAnnouncementVersion: 1,
			openingNote: "Ghi chú đã cập nhật từ máy khác",
			openingNotifiedStudentIds: ["st-1"],
		});

		rerender(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={refreshedCls}
				hasRealSessions={false}
				roster={roster}
				onConfirmed={onConfirmed}
			/>,
		);

		// Alert stays visible while fields sync to the refreshed class state.
		expect(within(dialog).getByRole("alert").textContent).toContain(
			"Thông tin khai giảng đã thay đổi bởi thao tác khác.",
		);
		expect(
			(
				within(dialog).getByLabelText(
					"Lời nhắn cho học viên (tùy chọn)",
				) as HTMLTextAreaElement
			).value,
		).toBe("Ghi chú đã cập nhật từ máy khác");
		expect(
			(
				within(dialog).getByRole("radio", {
					name: /Chỉ gửi cho học viên mới chưa nhận \(1\)/,
				}) as HTMLInputElement
			).checked,
		).toBe(true);
		expect(
			within(dialog).getByTestId("opening-date-readonly").textContent,
		).toContain(formatViWeekdayDate(laterFutureDate));

		// Retrying sends the refreshed version and omits startDate in new_only mode.
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Gửi bổ sung (1 email)" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		const [, secondInit] = fetchMock.mock.calls[1] as unknown as [
			string,
			RequestInit,
		];
		expect(JSON.parse(String(secondInit.body))).toEqual({
			mode: "new_only",
			note: "Ghi chú đã cập nhật từ máy khác",
			expectedVersion: 1,
		});
	});

	it("shows warning toast when target students exist but neither email nor in-app notification was queued", async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse(200, {
				ok: true,
				openingConfirmedAt: "2026-11-24T06:00:00.000Z",
				openingAnnouncementVersion: 1,
				startDate: futureDate,
				openingNote: "",
				queuedEmailCount: 0,
				inAppOnlyCount: 0,
				skippedNoEmail: [{ studentId: "st-3", studentName: "Lê Thu Hà" }],
				skippedAlreadySentCount: 0,
				notifiedStudentIds: [],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);
		const onClose = vi.fn();

		render(
			<ConfirmOpeningModal
				open
				onClose={onClose}
				cls={makeClassGroup()}
				hasRealSessions={false}
				roster={makeDefaultRoster()}
				onConfirmed={vi.fn(async () => undefined)}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Chốt & gửi 2 email" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(toastMock.success).not.toHaveBeenCalled();
		expect(toastMock.warning).toHaveBeenCalledWith(
			"Đã chốt khai giảng, nhưng chưa thể xếp hàng thông báo cho học viên. Vui lòng kiểm tra Nhật ký thông báo.",
		);
	});
});

describe("buildSuccessToast", () => {
	const baseRes = {
		ok: true as const,
		openingConfirmedAt: "2026-11-24T06:00:00.000Z",
		openingAnnouncementVersion: 1,
		startDate: futureDate,
		openingNote: "",
		queuedEmailCount: 0,
		inAppOnlyCount: 0,
		skippedNoEmail: [],
		skippedAlreadySentCount: 0,
		notifiedStudentIds: [],
	};

	it("checks inAppOnlyCount instead of skippedNoEmail before mentioning portal-only notifications", () => {
		const res = {
			...baseRes,
			queuedEmailCount: 2,
			inAppOnlyCount: 0,
			skippedNoEmail: [{ studentId: "st-3", studentName: "Lê Thu Hà" }],
		};
		expect(buildSuccessToast("initial", res, 3)).toEqual({
			kind: "success",
			message: "Đã chốt khai giảng và đưa 2 email vào hàng đợi gửi.",
		});
	});

	it("returns warning outcome when targetCount > 0 and both queuedEmailCount and inAppOnlyCount are 0", () => {
		expect(buildSuccessToast("initial", baseRes, 2)).toEqual({
			kind: "warning",
			message:
				"Đã chốt khai giảng, nhưng chưa thể xếp hàng thông báo cho học viên. Vui lòng kiểm tra Nhật ký thông báo.",
		});
		expect(buildSuccessToast("new_only", baseRes, 1)).toEqual({
			kind: "warning",
			message: "Chưa có thông báo mới nào được xếp hàng gửi.",
		});
		expect(buildSuccessToast("all", baseRes, 2)).toEqual({
			kind: "warning",
			message: "Chưa có thông báo mới nào được xếp hàng gửi.",
		});
	});

	it("returns success outcome when targetCount is 0 and no notifications were queued", () => {
		expect(buildSuccessToast("initial", baseRes, 0)).toEqual({
			kind: "success",
			message: "Đã chốt khai giảng.",
		});
		expect(buildSuccessToast("all", baseRes, 0)).toEqual({
			kind: "success",
			message: "Đã cập nhật thông báo khai giảng.",
		});
	});

	it("uses inAppOnlyCount for portal-only notifications when queuedEmailCount is 0", () => {
		const res = {
			...baseRes,
			inAppOnlyCount: 2,
			skippedNoEmail: [
				{ studentId: "st-1", studentName: "A" },
				{ studentId: "st-2", studentName: "B" },
				{ studentId: "st-3", studentName: "C" },
			],
		};
		expect(buildSuccessToast("initial", res, 3)).toEqual({
			kind: "success",
			message:
				"Đã chốt khai giảng. 2 học viên chưa có email chỉ nhận thông báo trong cổng học viên.",
		});
		expect(buildSuccessToast("new_only", res, 3)).toEqual({
			kind: "success",
			message:
				"Đã gửi thông báo trong cổng học viên cho 2 học viên chưa có email.",
		});
	});
});
