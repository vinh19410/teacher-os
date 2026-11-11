// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
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
		function Harness({ onWriteFail }: { onWriteFail: boolean }) {
			const [open, setOpen] = useState(true);
			return (
				<div>
					<button type="button" onClick={() => setOpen((v) => !v)}>
						Toggle
					</button>
					<ImportSyllabusModal
						open={open}
						onClose={() => setOpen(false)}
						classId={onWriteFail ? "cl-1" : "cl-1"}
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
		renderWithKernel(<Harness onWriteFail />);
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
});
