// @vitest-environment jsdom
import { ASSIGNMENT_PROMPT_ERROR_CODES } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/kernel-load-state";
import type { AssignmentPrompt } from "@/lib/mock-data";

const mockDispatch = vi.fn();
const mockRefresh = vi.fn();

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		dispatch: mockDispatch,
		refresh: mockRefresh,
	}),
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

import { DeleteDraftPromptModal } from "./delete-draft-prompt-modal";

afterEach(() => {
	cleanup();
	mockDispatch.mockReset();
	mockRefresh.mockReset();
});

const draftPrompt: AssignmentPrompt = {
	id: "ap-draft-1",
	skill: "writing",
	part: "task2",
	type: "discuss",
	task: "task2",
	genre: "discuss",
	title: "Draft Essay",
	band: "6.5",
	source: "Tự soạn",
	prompt: "<p>Prompt</p>",
	note: "",
	status: "draft",
	createdAt: "2026-11-20T10:00:00.000Z",
};

describe("DeleteDraftPromptModal", () => {
	test("dispatches delete-assignment-prompt and calls onDeleted on refreshed", async () => {
		mockDispatch.mockResolvedValue({ kind: "refreshed", id: "ap-draft-1" });
		const onDeleted = vi.fn();

		render(
			<DeleteDraftPromptModal
				open
				prompt={draftPrompt}
				onClose={vi.fn()}
				onDeleted={onDeleted}
			/>,
		);

		expect(screen.getByRole("dialog", { name: "Xóa bản nháp?" })).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Xóa bản nháp" }));

		await waitFor(() => {
			expect(mockDispatch).toHaveBeenCalledWith({
				type: "delete-assignment-prompt",
				promptId: "ap-draft-1",
			});
		});
		expect(onDeleted).toHaveBeenCalledWith("ap-draft-1");
	});

	test("shows alert error and keeps modal open on 409 definite-failure", async () => {
		mockDispatch.mockResolvedValue({
			kind: "definite-failure",
			status: 409,
			error: new HttpError(409, "conflict", {
				code: ASSIGNMENT_PROMPT_ERROR_CODES.DELETE_REFERENCED,
			}),
			reason: "DELETE_REFERENCED",
		});
		mockRefresh.mockResolvedValue(true);
		const onDeleted = vi.fn();

		render(
			<DeleteDraftPromptModal
				open
				prompt={draftPrompt}
				onClose={vi.fn()}
				onDeleted={onDeleted}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Xóa bản nháp" }));
		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain(
				"Bản nháp đang được dùng trong lớp học",
			);
		});
		expect(mockRefresh).toHaveBeenCalledTimes(1);
		expect(onDeleted).not.toHaveBeenCalled();
	});

	test("surfaces KernelSubmitNotice and blocks repeat delete on outcome-unknown", async () => {
		mockDispatch.mockResolvedValue({ kind: "outcome-unknown" });
		mockRefresh.mockResolvedValue(true);
		const onDeleted = vi.fn();

		render(
			<DeleteDraftPromptModal
				open
				prompt={draftPrompt}
				onClose={vi.fn()}
				onDeleted={onDeleted}
			/>,
		);

		const deleteBtn = screen.getByRole("button", {
			name: "Xóa bản nháp",
		}) as HTMLButtonElement;
		fireEvent.click(deleteBtn);

		await waitFor(() => {
			expect(deleteBtn.disabled).toBe(true);
		});
		expect(onDeleted).not.toHaveBeenCalled();
		const reconcileBtn = screen.getByRole("button", {
			name: /Tải lại & kiểm tra/i,
		});
		fireEvent.click(reconcileBtn);
		await waitFor(() => {
			expect(onDeleted).toHaveBeenCalledWith("ap-draft-1");
		});
	});
});
