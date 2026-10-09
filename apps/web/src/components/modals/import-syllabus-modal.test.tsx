// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
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
			path: "/api/classes/cl-1/import-syllabus",
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
		).toEqual(["Template A", "Template B"]);
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
				path: "/api/classes/cl-1/import-syllabus",
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
});
