// @vitest-environment jsdom

import type { StudyPackDetailView } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyPackEditorModal } from "./study-pack-editor-modal";

const mockUpdateStudyPack = vi.fn();
const mockCreateStudyPack = vi.fn();
const mockFetchStudyPackDetail = vi.fn();

vi.mock("@/lib/repos/study-pack", () => ({
	updateStudyPack: (...args: unknown[]) => mockUpdateStudyPack(...args),
	createStudyPack: (...args: unknown[]) => mockCreateStudyPack(...args),
	fetchStudyPackDetail: (...args: unknown[]) =>
		mockFetchStudyPackDetail(...args),
}));

const mockStore = vi.hoisted(() => ({
	data: {
		assignmentPrompts: [
			{
				id: "prompt-1",
				title: "Reading: Urban Trees",
				skill: "reading",
				status: "ready",
				writing: null,
			},
		],
	},
}));

vi.mock("@/lib/data-store", () => ({
	useData: () => mockStore,
}));

const editingPack: StudyPackDetailView = {
	id: "pack-1",
	orgId: "org-1",
	scope: "org",
	sourcePackId: null,
	title: "Bộ đề gốc",
	description: "Mô tả gốc",
	level: "B2",
	status: "ready",
	dayCount: 1,
	itemCount: 1,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
	items: [
		{
			id: "item-1",
			dayIndex: 2,
			position: 0,
			sourceKind: "org_prompt",
			sourceId: "prompt-1",
			title: "Reading: Urban Trees",
			skill: "reading",
			part: "p1",
			type: "mcq",
			level: "B2",
			status: "ready",
			note: "",
		},
	],
};

beforeEach(() => {
	mockUpdateStudyPack.mockReset();
	mockCreateStudyPack.mockReset();
	mockFetchStudyPackDetail.mockReset();
});

afterEach(() => {
	cleanup();
});

describe("StudyPackEditorModal (#720)", () => {
	it("allows clearing day input and entering multi-digit day without losing focus, and preserves unsaved edits across prop rerenders", async () => {
		mockUpdateStudyPack.mockResolvedValue({
			pack: { ...editingPack, title: "Bộ đề đã sửa" },
		});
		const onSaved = vi.fn();

		const { rerender } = render(
			<StudyPackEditorModal
				open={true}
				onClose={vi.fn()}
				editingPack={editingPack}
				onSaved={onSaved}
			/>,
		);

		const titleInput = screen.getByLabelText(
			/Tiêu đề bộ đề/,
		) as HTMLInputElement;
		fireEvent.change(titleInput, { target: { value: "Bộ đề chưa lưu" } });

		// Rerender with a new object identity for the same pack ID: unsaved title must survive
		rerender(
			<StudyPackEditorModal
				open={true}
				onClose={vi.fn()}
				editingPack={{ ...editingPack }}
				onSaved={onSaved}
			/>,
		);
		expect(
			(screen.getByLabelText(/Tiêu đề bộ đề/) as HTMLInputElement).value,
		).toBe("Bộ đề chưa lưu");

		const dayInput = screen.getByLabelText(
			"Ngày học cho Reading: Urban Trees",
		) as HTMLInputElement;
		dayInput.focus();
		expect(document.activeElement).toBe(dayInput);

		// Clearing to empty string must NOT jump focus or show premature day error
		fireEvent.change(dayInput, { target: { value: "" } });
		expect(dayInput.value).toBe("");
		expect(document.activeElement).toBe(dayInput);

		fireEvent.change(dayInput, { target: { value: "12" } });
		expect(dayInput.value).toBe("12");
		expect(document.activeElement).toBe(dayInput);

		fireEvent.blur(dayInput);
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

		await waitFor(() => {
			expect(mockUpdateStudyPack).toHaveBeenCalledWith("pack-1", {
				title: "Bộ đề chưa lưu",
				description: "Mô tả gốc",
				level: "B2",
				status: "ready",
				items: [
					{
						dayIndex: 12,
						sourceKind: "org_prompt",
						sourceId: "prompt-1",
						note: "",
					},
				],
			});
		});
	});
});
