// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
	type WriteHandler,
} from "@/test/kernel-harness";
import { CreateReportModal } from "./create-report-modal";

const students = () =>
	snapshotFixture({
		students: [
			studentRow({ id: "st-1", name: "Học viên Một" }),
			studentRow({ id: "st-2", name: "Học viên Hai" }),
		],
	});

async function openModal(onWrite?: WriteHandler, defaultStudentId?: string) {
	const server = startKernelServer(students(), onWrite);
	const onClose = vi.fn();
	renderWithKernel(
		<CreateReportModal
			open
			onClose={onClose}
			defaultStudentId={defaultStudentId}
		/>,
	);
	const dialog = await screen.findByRole("dialog");
	return { server, dialog, onClose };
}

function fill(dialog: HTMLElement, period: string, content: string) {
	fireEvent.change(within(dialog).getByLabelText("Chu kỳ"), {
		target: { value: period },
	});
	fireEvent.change(within(dialog).getByLabelText("Nội dung báo cáo"), {
		target: { value: content },
	});
}

const click = (dialog: HTMLElement, name: string) =>
	fireEvent.click(within(dialog).getByRole("button", { name }));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("CreateReportModal", () => {
	it("starts empty — no prefilled demo period or content", async () => {
		const { dialog } = await openModal();
		expect(
			(within(dialog).getByLabelText("Chu kỳ") as HTMLInputElement).value,
		).toBe("");
		expect(
			(within(dialog).getByLabelText("Nội dung báo cáo") as HTMLTextAreaElement)
				.value,
		).toBe("");
	});

	it.each([
		["Gửi báo cáo", "sent"],
		["Lưu nháp", "draft"],
	])(
		"%s persists the report with status %s and closes",
		async (button, status) => {
			const { server, dialog, onClose } = await openModal(undefined, "st-2");
			fill(dialog, " 01–07/10 ", "Tuần này tiến bộ tốt.");
			click(dialog, button);

			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(server.writes).toEqual([
				{
					method: "POST",
					path: "/api/reports",
					body: {
						studentId: "st-2",
						period: "01–07/10",
						content: "Tuần này tiến bộ tốt.",
						channel: "Zalo OA",
						status,
					},
				},
			]);
		},
	);

	it("refuses to send an empty report but saves it as a draft", async () => {
		const { server, dialog } = await openModal();
		fill(dialog, "01–07/10", "");
		click(dialog, "Gửi báo cáo");
		expect(
			await within(dialog).findByText("Nhập nội dung báo cáo trước khi gửi."),
		).toBeTruthy();
		expect(server.writes).toEqual([]);

		click(dialog, "Lưu nháp");
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].body).toMatchObject({
			status: "draft",
			content: "",
		});
	});

	it("keeps the typed report when the server rejects it", async () => {
		const { dialog, onClose } = await openModal(() => ({
			status: 422,
			body: {},
		}));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		fill(dialog, "01–07/10", "Nội dung dài đã gõ.");
		click(dialog, "Gửi báo cáo");

		expect(
			await within(dialog).findByText("Không gửi được báo cáo — thử lại."),
		).toBeTruthy();
		expect(
			(within(dialog).getByLabelText("Nội dung báo cáo") as HTMLTextAreaElement)
				.value,
		).toBe("Nội dung dài đã gõ.");
		expect(onClose).not.toHaveBeenCalled();
	});

	it("warns instead of closing when the response was lost", async () => {
		const { dialog, onClose } = await openModal(() => {
			throw new TypeError("Failed to fetch");
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		fill(dialog, "01–07/10", "Nội dung");
		click(dialog, "Gửi báo cáo");

		expect(
			await within(dialog).findByText(
				"Không chắc báo cáo đã lưu — kiểm tra danh sách trước khi thử lại.",
			),
		).toBeTruthy();
		expect(onClose).not.toHaveBeenCalled();
	});
});
