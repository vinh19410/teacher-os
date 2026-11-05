// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitFixture = {
	saving: false,
	error: undefined as string | undefined,
	notice: undefined as
		| { kind: "committed" | "unknown" | "reconcile-failed" }
		| undefined,
	submitBlocked: false,
	run: vi.fn(),
	reconcile: vi.fn(),
	reset: vi.fn(),
	setError: (message: string | undefined) => {
		submitFixture.error = message;
	},
};
const searchFixture = {
	current: {} as { classId?: string; promptId?: string },
};
// Real QueryClient (no hook mock): NewAssignmentRoute reads the kernel
// snapshot through QueryClientContext, so reconcile tests seed this client
// with setQueryData(kernelQueryKey, …).
let reconcileClient: QueryClient;

function renderRoute() {
	const view = render(
		<QueryClientProvider client={reconcileClient}>
			<NewAssignmentRoute />
		</QueryClientProvider>,
	);
	const rerenderRoute = () =>
		view.rerender(
			<QueryClientProvider client={reconcileClient}>
				<NewAssignmentRoute />
			</QueryClientProvider>,
		);
	return { ...view, rerenderRoute };
}
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => searchFixture.current,
	}),
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
const dataFixture = {
	data: {
		assignmentPrompts: [] as unknown[],
		classAssignments: [] as unknown[],
	},
};
vi.mock("@/lib/data-store", () => ({
	useData: () => dataFixture,
}));

import type { PreviewDraft } from "@/lib/assignment-preview-draft";
import { kernelQueryKey } from "@/lib/repos/kernel";
import { NewAssignmentRoute } from "./new";

// Module scope: reset chạy cho MỌI describe trong file — hook scoped trong
// một describe không chạm các describe khác (số lần run tích chéo test).
beforeEach(() => {
	reconcileClient = new QueryClient();
	submitFixture.run.mockReset();
	submitFixture.reconcile.mockReset();
	submitFixture.saving = false;
	submitFixture.error = undefined;
	submitFixture.notice = undefined;
	submitFixture.submitBlocked = false;
	draftFixture.value = null;
	searchFixture.current = {};
	dataFixture.data.assignmentPrompts = [];
	window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	cleanup();
});

describe("NewAssignmentRoute — Submit & Validation Feedback (#581)", () => {
	it("keeps Save button enabled and shows missing requirements alert when clicked on blank form", () => {
		renderRoute();

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
		renderRoute();

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

		renderRoute();

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

	it("submits update-assignment-prompt with omitted writing when writing is unchanged in edit mode (#614)", async () => {
		const samplePrompt = {
			id: "prompt-reading-1",
			skill: "reading",
			part: "p1",
			type: "tfng",
			task: "p1",
			genre: "tfng",
			title: "Reading Passage 1",
			band: "7.0",
			source: "Cambridge 16",
			prompt: "",
			passage: "<p>Passage text here</p>",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			questions: [
				{ stem: "Statement 1", opts: null, answer: "TRUE", alts: "" },
			],
			note: "",
			status: "ready",
			writing: {
				part: "task2",
				type: "opinion",
				prompt: "<p>Writing prompt</p>",
			},
			createdAt: "2026-11-01T00:00:00.000Z",
		};
		dataFixture.data.assignmentPrompts = [samplePrompt];
		searchFixture.current = { promptId: "prompt-reading-1" };

		renderRoute();

		const saveButton = screen.getByRole("button", {
			name: "Lưu thay đổi",
		});
		expect(saveButton).toBeDefined();
		expect((saveButton as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(saveButton);

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		const callArg = submitFixture.run.mock.calls[0][0];
		expect(callArg.type).toBe("update-assignment-prompt");
		expect(callArg.promptId).toBe("prompt-reading-1");
		// #630 field-diff: untouched resave sends ONLY the always-editable
		// fields — no locked content key (incl. writing, #614) can trip a
		// false PROMPT_CONTENT_LOCKED on an old prompt.
		expect(callArg.payload).toEqual({
			title: "Reading Passage 1",
			band: "7.0",
			source: "Cambridge 16",
			status: "ready",
		});
	});
});

describe("NewAssignmentRoute — field-diff edit payload + honest reconcile (#630)", () => {
	const editablePrompt = {
		id: "prompt-clean-1",
		skill: "reading",
		part: "p1",
		task: "p1",
		type: "tfng",
		genre: "tfng",
		title: "Clean Reading",
		band: "7.0",
		source: "Cam 18",
		prompt: "",
		passage: "<p>Passage</p>",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		optionBank: [],
		// Shape snapshot parseQuestions thật (S-1 review #631): luôn có
		// type/pin null — composer kế thừa qua items nên payload và
		// snapshot đối xứng 2 đầu.
		questions: [
			{
				stem: "S1",
				opts: null,
				answer: "TRUE",
				alts: "",
				type: null,
				pin: null,
			},
		],
		note: "",
		status: "ready",
		writing: null,
		createdAt: "2026-11-01T00:00:00.000Z",
	};

	function openEditMode(prompt: Record<string, unknown>) {
		dataFixture.data.assignmentPrompts = [prompt];
		searchFixture.current = { promptId: prompt.id as string };
	}

	it("edit resave with NO edits sends only title/band/source/status", () => {
		openEditMode({ ...editablePrompt });
		submitFixture.run.mockResolvedValue(undefined);

		renderRoute();
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

		expect(submitFixture.run.mock.calls).toHaveLength(1);
		const action = submitFixture.run.mock.calls[0][0] as {
			payload: Record<string, unknown>;
		};
		expect(Object.keys(action.payload).sort()).toEqual([
			"band",
			"source",
			"status",
			"title",
		]);
	});

	it("old-style prompt (plain \\n, &, null type, empty explanation) resaves without locked fields", () => {
		openEditMode({
			...editablePrompt,
			id: "prompt-legacy-1",
			title: "Legacy Reading",
			band: "6.5",
			source: "",
			type: null,
			genre: "tfng",
			prompt: "Read the text.\nAnswer A & B.",
			passage: "Old passage text",
			intro: null,
			transcript: null,
			cuePoints: null,
			imageUrl: null,
			optionBank: null,
			note: null,
			questions: [
				{ stem: "S1", opts: null, answer: "TRUE", alts: "", explanation: "" },
			],
		});
		submitFixture.run.mockResolvedValue(undefined);

		renderRoute();
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		const action = submitFixture.run.mock.calls[0][0] as {
			payload: Record<string, unknown>;
		};
		// Locked content fields must be absent — resave of a legacy prompt
		// never re-sends re-normalized bytes that would 409.
		for (const key of [
			"type",
			"prompt",
			"passage",
			"intro",
			"transcript",
			"cueTopic",
			"cuePoints",
			"audioName",
			"imageUrl",
			"questions",
			"optionBank",
			"note",
			"writing",
		]) {
			expect(key in action.payload).toBe(false);
		}
	});

	it("reconcile shows success only when the fresh snapshot contains the submitted payload", async () => {
		openEditMode({ ...editablePrompt });
		submitFixture.run.mockResolvedValue(undefined);
		submitFixture.notice = { kind: "committed" };
		submitFixture.reconcile.mockResolvedValue(true);
		reconcileClient.setQueryData(kernelQueryKey, {
			assignmentPrompts: [{ ...editablePrompt }],
		});

		renderRoute();
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));

		expect(await screen.findByText("Đã cập nhật bài tập")).toBeTruthy();
		expect(submitFixture.error).toBeUndefined();
	});

	it("reconcile keeps the draft and warns when the snapshot is stale", async () => {
		openEditMode({ ...editablePrompt });
		submitFixture.run.mockResolvedValue(undefined);
		submitFixture.notice = { kind: "committed" };
		submitFixture.reconcile.mockResolvedValue(true);
		// Server chưa persist (row vẫn là dữ liệu cũ) → không được "Đã cập nhật".
		reconcileClient.setQueryData(kernelQueryKey, {
			assignmentPrompts: [{ ...editablePrompt, title: "Đã bị server đổi" }],
		});
		const { rerenderRoute } = renderRoute();

		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
		await waitFor(() =>
			expect(submitFixture.error).toBe(
				"Đã tải lại dữ liệu nhưng thay đổi của bạn chưa được lưu. Vui lòng lưu lại.",
			),
		);
		rerenderRoute();

		expect(screen.getByRole("alert")).toBeTruthy();
		expect(screen.queryByText("Đã cập nhật bài tập")).toBeNull();
		const saveButton = screen.getByRole("button", { name: "Lưu thay đổi" });
		expect((saveButton as HTMLButtonElement).disabled).toBe(false);
	});

	it("reconcile refresh failure keeps the notice state untouched", async () => {
		openEditMode({ ...editablePrompt });
		submitFixture.run.mockResolvedValue(undefined);
		submitFixture.notice = { kind: "committed" };
		submitFixture.reconcile.mockResolvedValue(false);

		renderRoute();
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));

		await waitFor(() => expect(submitFixture.reconcile).toHaveBeenCalled());
		expect(submitFixture.error).toBeUndefined();
		expect(screen.queryByText("Đã cập nhật bài tập")).toBeNull();
	});

	it("reconcile passes when the snapshot is the zod-normalized form of the sent questions", async () => {
		openEditMode({ ...editablePrompt });
		submitFixture.run.mockResolvedValue(undefined);
		submitFixture.notice = { kind: "committed" };
		submitFixture.reconcile.mockResolvedValue(true);
		// Server ghi bản zod (trim stem, key order theo schema) — payload gửi
		// đi giữ giá trị raw lúc gõ. Reconcile phải chuẩn hoá trước khi so.
		// Shape snapshot khớp parseQuestions thật (snapshot.ts): luôn có
		// opts/type/pin (null khi không có), alts "" — S-1 review #631.
		reconcileClient.setQueryData(kernelQueryKey, {
			assignmentPrompts: [
				{
					...editablePrompt,
					questions: [
						{
							stem: "S1 with spaces",
							opts: null,
							answer: "TRUE",
							alts: "",
							type: null,
							pin: null,
						},
					],
				},
			],
		});

		renderRoute();
		fireEvent.change(screen.getByLabelText("Nội dung câu hỏi phía học viên"), {
			target: { value: "  S1 with spaces  " },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));

		expect(await screen.findByText("Đã cập nhật bài tập")).toBeTruthy();
		expect(submitFixture.error).toBeUndefined();
	});

	it("save blocked by a pending notice does not clobber the captured payload", async () => {
		openEditMode({ ...editablePrompt });
		submitFixture.run.mockResolvedValue(undefined);
		submitFixture.reconcile.mockResolvedValue(true);
		const { rerenderRoute } = renderRoute();

		// Save #1: đổi title → dispatch thật, payload "Đã lưu A" được gửi.
		fireEvent.change(screen.getByLabelText("Tiêu đề"), {
			target: { value: "Đã lưu A" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		expect(submitFixture.run).toHaveBeenCalledTimes(1);

		// Hook sang trạng thái notice (committed) — lượt Save sau bị chặn.
		submitFixture.notice = { kind: "committed" };
		submitFixture.submitBlocked = true;
		rerenderRoute();

		// Save #2 KHÔNG được dispatch — payload "Bị chặn B" chưa bao giờ gửi,
		// không được ghi đè lên ref reconcile.
		fireEvent.change(screen.getByLabelText("Tiêu đề"), {
			target: { value: "Bị chặn B" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		expect(submitFixture.run).toHaveBeenCalledTimes(1);

		// Reconcile: snapshot chứa đúng payload của save #1 → thành công.
		reconcileClient.setQueryData(kernelQueryKey, {
			assignmentPrompts: [{ ...editablePrompt, title: "Đã lưu A" }],
		});
		fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));

		expect(await screen.findByText("Đã cập nhật bài tập")).toBeTruthy();
		expect(submitFixture.error).toBeUndefined();
	});

	it("reconcile passes when sent question payload omits type or pin but snapshot returns them as null (#632)", async () => {
		openEditMode({
			...editablePrompt,
			questions: [
				{
					stem: "S1 legacy",
					opts: null,
					answer: "TRUE",
					alts: "",
				},
			],
		});
		submitFixture.run.mockResolvedValue(undefined);
		submitFixture.notice = { kind: "committed" };
		submitFixture.reconcile.mockResolvedValue(true);

		reconcileClient.setQueryData(kernelQueryKey, {
			assignmentPrompts: [
				{
					...editablePrompt,
					questions: [
						{
							stem: "S1 updated",
							opts: null,
							answer: "TRUE",
							alts: "",
							type: null,
							pin: null,
						},
					],
				},
			],
		});

		renderRoute();
		fireEvent.change(screen.getByLabelText("Nội dung câu hỏi phía học viên"), {
			target: { value: "S1 updated" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));

		expect(await screen.findByText("Đã cập nhật bài tập")).toBeTruthy();
		expect(submitFixture.error).toBeUndefined();
	});

	it("reconcile fails and warns when sent questions truly differ from snapshot (#632)", async () => {
		openEditMode({
			...editablePrompt,
			questions: [
				{
					stem: "S1 legacy",
					opts: null,
					answer: "TRUE",
					alts: "",
				},
			],
		});
		submitFixture.run.mockResolvedValue(undefined);
		submitFixture.notice = { kind: "committed" };
		submitFixture.reconcile.mockResolvedValue(true);

		reconcileClient.setQueryData(kernelQueryKey, {
			assignmentPrompts: [
				{
					...editablePrompt,
					questions: [
						{
							stem: "S1 different on server",
							opts: null,
							answer: "TRUE",
							alts: "",
							type: null,
							pin: null,
						},
					],
				},
			],
		});

		const { rerenderRoute } = renderRoute();
		fireEvent.change(screen.getByLabelText("Nội dung câu hỏi phía học viên"), {
			target: { value: "S1 updated" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
		fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));

		await waitFor(() =>
			expect(submitFixture.error).toBe(
				"Đã tải lại dữ liệu nhưng thay đổi của bạn chưa được lưu. Vui lòng lưu lại.",
			),
		);
		rerenderRoute();

		expect(screen.getByRole("alert")).toBeTruthy();
		expect(screen.queryByText("Đã cập nhật bài tập")).toBeNull();
	});

	it("does not re-send questions when questions only differ by null or missing keys (#632)", () => {
		openEditMode({
			...editablePrompt,
			questions: [
				{
					stem: "S1",
					opts: null,
					answer: "TRUE",
					alts: "",
				},
			],
		});
		submitFixture.run.mockResolvedValue(undefined);

		renderRoute();
		fireEvent.change(screen.getByLabelText("Tiêu đề"), {
			target: { value: "Clean Title Updated" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		const action = submitFixture.run.mock.calls[0][0] as {
			payload: Record<string, unknown>;
		};
		expect("questions" in action.payload).toBe(false);
	});
});
