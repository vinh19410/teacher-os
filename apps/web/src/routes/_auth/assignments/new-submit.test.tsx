// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitFixture = {
	saving: false,
	error: undefined as string | undefined,
	notice: undefined,
	submitBlocked: false,
	run: vi.fn(),
	reconcile: vi.fn(),
	reset: vi.fn(),
};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));
vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => submitFixture,
}));
const draftFixture: { value: PreviewDraft | null } = { value: null };
vi.mock("@/lib/assignment-preview-draft", () => ({
	takePreviewDraft: () => draftFixture.value,
	savePreviewDraft: vi.fn(),
}));
vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: {
			assignmentPrompts: [],
			classAssignments: [],
		},
	}),
}));

import type { PreviewDraft } from "@/lib/assignment-preview-draft";
import { NewAssignmentRoute } from "./new";

describe("NewAssignmentRoute — Submit & Validation Feedback (#581)", () => {
	beforeEach(() => {
		submitFixture.run.mockReset();
		draftFixture.value = null;
		window.HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
	});

	it("keeps Save button enabled and shows missing requirements alert when clicked on blank form", () => {
		render(<NewAssignmentRoute />);

		const saveButton = screen.getByRole("button", {
			name: "Lưu vào ngân hàng",
		});
		expect(saveButton).toBeDefined();
		expect((saveButton as HTMLButtonElement).disabled).toBe(false);

		// Initially, no alert is visible
		expect(screen.queryByTestId("assignment-save-missing-alert")).toBeNull();

		// Click Save button on empty form
		fireEvent.click(saveButton);

		// submit.run must NOT be called
		expect(submitFixture.run).not.toHaveBeenCalled();

		// role="alert" appears with missing requirements
		const alert = screen.getByTestId("assignment-save-missing-alert");
		expect(alert).toBeDefined();
		expect(alert.textContent).toContain("Cần hoàn thiện trước khi lưu");
		expect(alert.textContent).toContain(
			"Chọn dạng đề trước khi lưu sẵn sàng giao",
		);
		expect(alert.textContent).toContain("Nhập tiêu đề bài tập");
		expect(alert.textContent).toContain("Dán hoặc soạn đề trước khi lưu");

		// The first invalid field (type in DOM order) is scrolled into view
		const typeEl = document.getElementById("assignment-field-type");
		expect(typeEl).not.toBeNull();
		expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
	});

	it("allows clicking a requirement in the alert to focus the corresponding field", () => {
		render(<NewAssignmentRoute />);

		const saveButton = screen.getByRole("button", {
			name: "Lưu vào ngân hàng",
		});
		fireEvent.click(saveButton);

		const titleRequirementBtn = screen.getByRole("button", {
			name: "Nhập tiêu đề bài tập.",
		});
		expect(titleRequirementBtn).toBeDefined();

		const titleInput = document.getElementById("assignment-field-title");
		if (!titleInput) throw new Error("titleInput missing");
		const scrollSpy = vi.spyOn(titleInput, "scrollIntoView");
		const focusSpy = vi.spyOn(titleInput, "focus");

		fireEvent.click(titleRequirementBtn);

		expect(scrollSpy).toHaveBeenCalled();
		expect(focusSpy).toHaveBeenCalled();
	});

	it("calls submit.run when form is valid", async () => {
		draftFixture.value = {
			task: "task2",
			genre: "discuss",
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Cambridge 18 Essay",
			band: "7.0",
			source: "Cam 18",
			prompt: "<p>Discuss both views and give your opinion.</p>",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			items: [],
			note: "",
			status: "ready",
			writing: null,
		};

		render(<NewAssignmentRoute />);

		const saveButton = screen.getByRole("button", {
			name: "Lưu vào ngân hàng",
		});
		expect((saveButton as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(saveButton);

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		expect(submitFixture.run).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "create-assignment-prompt",
				payload: expect.objectContaining({
					title: "Cambridge 18 Essay",
					skill: "writing",
					part: "task2",
					type: "discuss",
					status: "ready",
				}),
			}),
		);
	});
});
