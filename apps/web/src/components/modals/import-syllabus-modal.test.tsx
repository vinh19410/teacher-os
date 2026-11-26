// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
import { ImportSyllabusModal } from "./import-syllabus-modal";

const snapshot = () =>
	snapshotFixture({
		classes: [classRow({ id: "cl-1", name: "IELTS Writing" })],
		syllabi: [
			syllabusRow({ id: "sy-a", name: "Template A" }),
			syllabusRow({ id: "sy-b", name: "Template B" }),
			syllabusRow({
				id: "sy-copy",
				name: "Bản sao lớp khác",
				classId: "cl-9",
				sourceTemplateId: "sy-a",
			}),
		],
	});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("ImportSyllabusModal", () => {
	itFollowsTheKernelFormContract({
		snapshot,
		render: (onClose) => (
			<ImportSyllabusModal open onClose={onClose} classId="cl-1" />
		),
		submit: "Nhập giáo trình",
		expectedWrite: {
			path: "/api/classes/cl-1/curriculum/import",
			body: { templateId: "sy-a" },
		},
	});

	it("names the target class and offers shared templates only", async () => {
		startKernelServer(snapshot());
		renderWithKernel(
			<ImportSyllabusModal open onClose={() => {}} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain(
			'Lớp "IELTS Writing" nhận một bản sao',
		);
		expect(
			within(dialog)
				.getAllByRole("option")
				.map((o) => o.textContent),
		).toEqual(["Template A · 0 buổi", "Template B · 0 buổi"]);
	});

	it("imports the chosen template into the class and closes after the refresh", async () => {
		const server = startKernelServer(snapshot());
		const onClose = vi.fn();
		renderWithKernel(
			<ImportSyllabusModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByRole("combobox"), {
			target: { value: "sy-b" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/curriculum/import",
				body: { templateId: "sy-b" },
			},
		]);
	});

	it("stays open with a reconcile notice when the write lands but the refresh fails", async () => {
		const server = startKernelServer(snapshot(), (_req, srv) => {
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return undefined;
		});
		const onClose = vi.fn();
		renderWithKernel(
			<ImportSyllabusModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);

		await waitFor(() => expect(server.writes).toHaveLength(1));
		await waitFor(() =>
			expect(
				(
					within(dialog).getByRole("button", {
						name: "Nhập giáo trình",
					}) as HTMLButtonElement
				).disabled,
			).toBe(true),
		);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("maps allowlisted 409/422 curriculum import error codes to actionable Vietnamese alerts (#670)", async () => {
		let nextReply: { status: number; body: unknown } = {
			status: 409,
			body: {
				error:
					"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.",
				reason: "has-manual-sessions",
				code: "MANUAL_SESSIONS_EXIST",
			},
		};
		startKernelServer(snapshot(), () => nextReply);
		renderWithKernel(
			<ImportSyllabusModal open onClose={() => {}} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toBe(
			"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.",
		);

		nextReply = {
			status: 422,
			body: {
				error:
					"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.",
				reason: "empty-template",
				code: "CURRICULUM_EMPTY_TEMPLATE",
			},
		};
		fireEvent.change(within(dialog).getByRole("combobox"), {
			target: { value: "sy-b" },
		});
		expect(within(dialog).queryByRole("alert")).toBeNull();

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.",
		);
	});

	it("clears alert error on reopen without wiping reconcile notice / submitBlocked (#670)", async () => {
		function Harness() {
			const [open, setOpen] = useState(true);
			return (
				<div>
					<button type="button" onClick={() => setOpen((v) => !v)}>
						Toggle
					</button>
					<ImportSyllabusModal
						open={open}
						onClose={() => setOpen(false)}
						classId="cl-1"
					/>
				</div>
			);
		}

		// 1) Error cleared on reopen
		let failWrite = true;
		startKernelServer(snapshot(), (_req, srv) => {
			if (failWrite) {
				return {
					status: 409,
					body: {
						error: "Lớp đã có buổi học thủ công.",
						reason: "has-manual-sessions",
						code: "MANUAL_SESSIONS_EXIST",
					},
				};
			}
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return undefined;
		});
		renderWithKernel(<Harness />);
		let dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toContain(
			"Lớp đã có buổi học thủ công",
		);

		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		dialog = await screen.findByRole("dialog");
		expect(within(dialog).queryByRole("alert")).toBeNull();

		// 2) Committed notice + submitBlocked preserved on reopen
		failWrite = false;
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		await waitFor(() =>
			expect(
				(
					within(dialog).getByRole("button", {
						name: "Nhập giáo trình",
					}) as HTMLButtonElement
				).disabled,
			).toBe(true),
		);

		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		dialog = await screen.findByRole("dialog");
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Nhập giáo trình",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("shows conflicting & other manual dates formatted as Vietnamese weekday + dd/mm/yyyy and overwrites after user confirms", async () => {
		const toastSuccess = vi
			.spyOn(toast, "success")
			.mockImplementation(() => "");
		let attempt = 0;
		const server = startKernelServer(snapshot(), () => {
			attempt += 1;
			if (attempt === 1) {
				return {
					status: 409,
					body: {
						error: "Lớp đã có buổi học thủ công trùng ngày với giáo trình.",
						reason: "has-manual-sessions",
						code: "MANUAL_SESSIONS_EXIST",
						conflictingDates: ["2026-11-10"],
						otherManualDates: ["2026-11-11"],
						manualSessionCount: 2,
						overwriteHash: "hash-1",
					},
				};
			}
			return { status: 201, body: { id: "sy-copy-new" } };
		});
		const onClose = vi.fn();
		renderWithKernel(
			<ImportSyllabusModal open onClose={onClose} classId="cl-1" />,
		);

		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain("Thứ Ba, 10/11/2026");
		expect(alert.textContent).toContain("Thứ Tư, 11/11/2026");
		expect(alert.textContent).toContain("Zoom");

		// Phím Enter / submit form lúc đang ở bước xác nhận không gửi lại bước 1
		fireEvent.submit(dialog.querySelector("form") as HTMLFormElement);
		expect(server.writes).toHaveLength(1);

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Đồng ý ghi đè" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/curriculum/import",
				body: { templateId: "sy-a" },
			},
			{
				method: "POST",
				path: "/api/classes/cl-1/curriculum/import",
				body: {
					templateId: "sy-a",
					overwriteManualSessions: true,
					overwriteHash: "hash-1",
				},
			},
		]);
		expect(toastSuccess).toHaveBeenCalledWith(
			"Đã ghi đè buổi thủ công và nhập giáo trình.",
		);
		toastSuccess.mockRestore();
	});

	it("updates overwrite warning with fresh hash when Race B returns updated 409 on confirm, and resets on Back or template change", async () => {
		let attempt = 0;
		const server = startKernelServer(snapshot(), () => {
			attempt += 1;
			if (attempt === 1) {
				return {
					status: 409,
					body: {
						error: "Trùng ngày",
						reason: "has-manual-sessions",
						code: "MANUAL_SESSIONS_EXIST",
						conflictingDates: ["2026-11-10"],
						otherManualDates: [],
						manualSessionCount: 1,
						overwriteHash: "hash-1",
					},
				};
			}
			if (attempt === 2) {
				return {
					status: 409,
					body: {
						error: "Danh sách vừa thay đổi",
						reason: "has-manual-sessions",
						code: "MANUAL_SESSIONS_EXIST",
						conflictingDates: ["2026-11-10"],
						otherManualDates: ["2026-11-12"],
						manualSessionCount: 2,
						overwriteHash: "hash-2",
					},
				};
			}
			return { status: 201, body: { id: "sy-copy-new" } };
		});
		const onClose = vi.fn();
		renderWithKernel(
			<ImportSyllabusModal open onClose={onClose} classId="cl-1" />,
		);

		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		await within(dialog).findByRole("button", { name: "Đồng ý ghi đè" });

		// Nhấn Quay lại → hủy trạng thái xác nhận, quay về nút Nhập giáo trình
		fireEvent.click(within(dialog).getByRole("button", { name: "Quay lại" }));
		expect(
			within(dialog).queryByRole("button", { name: "Đồng ý ghi đè" }),
		).toBeNull();
		expect(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		).toBeTruthy();

		// Trigger lại bước 1 rồi đổi template → hủy trạng thái xác nhận
		attempt = 0;
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		await within(dialog).findByRole("button", { name: "Đồng ý ghi đè" });

		fireEvent.change(within(dialog).getByRole("combobox"), {
			target: { value: "sy-b" },
		});
		expect(
			within(dialog).queryByRole("button", { name: "Đồng ý ghi đè" }),
		).toBeNull();
		expect(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		).toBeTruthy();

		// Quay lại template A, trigger lại bước 1 → nhận Race B ở lần xác nhận
		attempt = 0;
		fireEvent.change(within(dialog).getByRole("combobox"), {
			target: { value: "sy-a" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		fireEvent.click(
			await within(dialog).findByRole("button", { name: "Đồng ý ghi đè" }),
		);

		const refreshedAlert = await within(dialog).findByRole("alert");
		expect(refreshedAlert.textContent).toContain("Thứ Năm, 12/11/2026");
		expect(refreshedAlert.textContent).toContain("vừa thay đổi");

		// Xác nhận lần 2 gửi đúng hash-2
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Đồng ý ghi đè" }),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes.at(-1)?.body).toEqual({
			templateId: "sy-a",
			overwriteManualSessions: true,
			overwriteHash: "hash-2",
		});
	});

	it("locks overwrite controls on committed refresh failure and fires success toast after reconcile", async () => {
		const toastSuccess = vi
			.spyOn(toast, "success")
			.mockImplementation(() => "");
		let attempt = 0;
		const server = startKernelServer(snapshot(), (_req, srv) => {
			attempt += 1;
			if (attempt === 1) {
				return {
					status: 409,
					body: {
						error: "Trùng ngày",
						reason: "has-manual-sessions",
						code: "MANUAL_SESSIONS_EXIST",
						conflictingDates: [],
						otherManualDates: ["2026-11-11"],
						manualSessionCount: 1,
						overwriteHash: "hash-other",
					},
				};
			}
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return { status: 201, body: { id: "sy-copy-new" } };
		});
		const onClose = vi.fn();
		renderWithKernel(
			<ImportSyllabusModal open onClose={onClose} classId="cl-1" />,
		);

		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain("Thứ Tư, 11/11/2026");

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Đồng ý ghi đè" }),
		);

		const reloadButton = await within(dialog).findByRole("button", {
			name: "Tải lại",
		});
		expect(
			within(dialog).queryByRole("button", { name: "Đồng ý ghi đè" }),
		).toBeNull();
		expect(
			(within(dialog).getByRole("combobox") as HTMLSelectElement).disabled,
		).toBe(true);
		expect(onClose).not.toHaveBeenCalled();
		expect(toastSuccess).not.toHaveBeenCalled();

		// Khi reconcile thành công → đóng modal và hiện toast ghi đè
		server.snapshotReply = undefined;
		fireEvent.click(reloadButton);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(toastSuccess).toHaveBeenCalledWith(
			"Đã ghi đè buổi thủ công và nhập giáo trình.",
		);
		toastSuccess.mockRestore();
	});

	it("blocks overwrite action for TA role and for MANUAL_SESSIONS_COMPLETED / 422 errors", async () => {
		const taSnap = snapshot();
		taSnap.viewer = { role: "ta", canAccessFinance: false };
		let nextReply: { status: number; body: unknown } = {
			status: 409,
			body: {
				error: "Trùng ngày",
				reason: "has-manual-sessions",
				code: "MANUAL_SESSIONS_EXIST",
				conflictingDates: ["2026-11-10"],
				otherManualDates: [],
				manualSessionCount: 1,
				overwriteHash: "hash-ta",
			},
		};
		startKernelServer(taSnap, () => nextReply);
		renderWithKernel(
			<ImportSyllabusModal open onClose={() => {}} classId="cl-1" />,
		);

		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		const taAlert = await within(dialog).findByRole("alert");
		expect(taAlert.textContent).toContain("giáo viên phụ trách");
		expect(
			within(dialog).queryByRole("button", { name: "Đồng ý ghi đè" }),
		).toBeNull();

		nextReply = {
			status: 409,
			body: {
				error: "Đã điểm danh",
				reason: "has-completed-manual-sessions",
				code: "MANUAL_SESSIONS_COMPLETED",
				completedDates: ["2026-11-10"],
			},
		};
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		const completedAlert = await within(dialog).findByRole("alert");
		expect(completedAlert.textContent).toContain("Thứ Ba, 10/11/2026");
		expect(completedAlert.textContent).toContain("điểm danh");
		expect(
			within(dialog).queryByRole("button", { name: "Đồng ý ghi đè" }),
		).toBeNull();

		nextReply = {
			status: 422,
			body: {
				error: "Thiếu lịch học hợp lệ",
				code: "CURRICULUM_INVALID_CLASS_SCHEDULE",
			},
		};
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toContain(
			"lịch học trong tuần",
		);
	});

	it("clears pending overwrite state on modal reopen and invalidates it when the confirmed template disappears from snapshot", async () => {
		function Harness() {
			const [open, setOpen] = useState(true);
			return (
				<div>
					<button type="button" onClick={() => setOpen((v) => !v)}>
						Toggle
					</button>
					<ImportSyllabusModal
						open={open}
						onClose={() => setOpen(false)}
						classId="cl-1"
					/>
				</div>
			);
		}

		startKernelServer(snapshot(), () => ({
			status: 409,
			body: {
				error: "Trùng ngày",
				reason: "has-manual-sessions",
				code: "MANUAL_SESSIONS_EXIST",
				conflictingDates: ["2026-11-10"],
				otherManualDates: [],
				manualSessionCount: 1,
				overwriteHash: "hash-reopen",
			},
		}));
		renderWithKernel(<Harness />);

		let dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		await within(dialog).findByRole("button", { name: "Đồng ý ghi đè" });

		// Đóng rồi mở lại → xóa pendingOverwrite, trở về bước 1
		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		dialog = await screen.findByRole("dialog");
		expect(
			within(dialog).queryByRole("button", { name: "Đồng ý ghi đè" }),
		).toBeNull();
		expect(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		).toBeTruthy();

		// Template bị chọn đổi sang khác sau khi đã vào bước xác nhận → vô hiệu activeOverwrite
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Nhập giáo trình" }),
		);
		await within(dialog).findByRole("button", { name: "Đồng ý ghi đè" });
		fireEvent.change(within(dialog).getByRole("combobox"), {
			target: { value: "sy-b" },
		});
		expect(
			within(dialog).queryByRole("button", { name: "Đồng ý ghi đè" }),
		).toBeNull();
	});
});
