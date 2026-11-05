// @vitest-environment jsdom

import { assignmentPromptUpdateSchema } from "@teacher-os/api/contracts";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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
	useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => submitFixture,
}));

afterEach(() => {
	cleanup();
	submitFixture.run.mockReset();
});

const questions = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		stem: `Q${index + 1}`,
		answer: "TRUE",
		opts: null,
		alts: "",
	}));

const promptP1 = {
	id: "prompt-p1",
	skill: "reading",
	part: "p1",
	type: "tfng",
	task: "p1",
	genre: "tfng",
	title: "Passage 1 — Stepwells",
	band: "7.0",
	source: "Cambridge 18",
	prompt: "",
	passage: "Text…",
	questions: questions(13),
	status: "ready",
	createdAt: "2026-09-27T00:00:00Z",
};

// A real-world passage 2 with 12 questions after a 13-question passage 1,
// and a 14-question passage 3: the outline must number 1–13 / 14–25 / 26–39,
// not the static preset 1 / 14 / 27.
const promptP2 = {
	...promptP1,
	id: "prompt-p2",
	part: "p2",
	task: "p2",
	title: "Passage 2 — Glass",
	questions: questions(12),
};
const promptP3 = {
	...promptP1,
	id: "prompt-p3",
	part: "p3",
	task: "p3",
	title: "Passage 3 — Memory",
	questions: questions(14),
};
const promptEdit = {
	...promptP1,
	id: "prompt-edit",
	questions: questions(2).map((q, index) =>
		index === 0 ? { ...q, explanation: "<p>Giải thích gốc câu 1</p>" } : q,
	),
};

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: {
			assignmentPrompts: [promptP1, promptP2, promptP3, promptEdit],
			assignmentTests: [
				{
					id: "at-x",
					title: "Bộ đề khác",
					description: null,
					skill: "reading",
					timeLimitSeconds: 3600,
					collection: "Cambridge IELTS 18",
					testGroup: "TEST 5",
					status: "ready",
					parts: [],
				},
			],
		},
	}),
}));

import type { KernelAssignmentTestRow } from "@teacher-os/api/contracts";
import { TestBuilderShell } from "./test-builder-shell";

const editTest: KernelAssignmentTestRow = {
	id: "at-1",
	title: "IELTS Reading Mock 01",
	description: null,
	skill: "reading",
	timeLimitSeconds: 3600,
	collection: "Cambridge IELTS 18",
	testGroup: "TEST 5",
	status: "draft",
	parts: [
		{
			testId: "at-1",
			promptId: "prompt-p1",
			part: "p1",
			position: 0,
			qStartOverride: null,
		},
	],
};

describe("TestBuilderShell (phase-03 Tasks 3.3/3.4/3.5)", () => {
	it("create mode: outline 0/3 parts, 3 slot từ preset reading, header form + datalist", () => {
		const html = renderToStaticMarkup(<TestBuilderShell mode="create" />);
		// Outline trái theo mẫu Selfomy "N parts, N questions".
		expect(html).toContain("0/3 parts · 0 questions");
		expect(html).toContain("Bộ đề chưa đặt tên");
		expect(html).toContain("Passage 1");
		expect(html).toContain("Passage 2");
		expect(html).toContain("Passage 3");
		expect(html).toContain("Trống");
		// Slot trống có 2 đường vào.
		expect(html.match(/Chọn từ ngân hàng/g)?.length).toBe(3);
		expect(html.match(/Soạn mới/g)?.length).toBe(3);
		// Header form + save.
		expect(html).toContain("Thông tin bộ đề");
		expect(html).toContain("Time limit");
		expect(html).toContain("60:00");
		expect(html).toContain("Tạo bộ đề");
		// Datalist distinct từ snapshot.assignmentTests.
		expect(html).toContain('value="Cambridge IELTS 18"');
		expect(html).toContain('value="TEST 5"');
	});

	it("edit mode: part đã gán hiển thị title, số câu theo computeTestRanges, nút gỡ", () => {
		const html = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={editTest} />,
		);
		expect(html).toContain("IELTS Reading Mock 01");
		expect(html).toContain("1/3 parts · 13 questions");
		expect(html).toContain("Passage 1 — Stepwells");
		// 13 câu thật → Câu 1–13 (computeTestRanges, không qStart tĩnh).
		expect(html).toContain("Câu 1–13");
		// Nút gỡ render icon ✕ — accessible name giữ nhãn đầy đủ.
		expect(html).toContain('aria-label="Gỡ khỏi test"');
		expect(html).toContain("Chỉnh sửa");
		// Skill khóa ở edit mode.
		expect(html).toContain("Kỹ năng cố định theo parts đã gắn.");
		// Còn 2 slot trống.
		expect(html.match(/Chọn từ ngân hàng/g)?.length).toBe(2);
	});

	it("numbers every part from the real question counts, not the preset starts", () => {
		const fullTest: KernelAssignmentTestRow = {
			...editTest,
			parts: (["p1", "p2", "p3"] as const).map((part, position) => ({
				testId: "at-1",
				promptId: `prompt-${part}`,
				part,
				position,
				qStartOverride: null,
			})),
		};
		const html = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={fullTest} />,
		);
		expect(html).toContain("3/3 parts · 39 questions");
		expect(html).toContain("Câu 1–13");
		expect(html).toContain("Câu 14–25");
		expect(html).toContain("Câu 26–39");
		expect(html).not.toContain("Câu 27–");
	});

	it("phase-04 Task 4.3: nút Xem trước có mặt ở cả create lẫn edit", () => {
		const createHtml = renderToStaticMarkup(<TestBuilderShell mode="create" />);
		expect(createHtml).toContain("Xem trước");
		const editHtml = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={editTest} />,
		);
		expect(editHtml).toContain("Xem trước");
	});

	it("phase-05 Task 5.2: nút Soát đáp án có mặt ở cả create lẫn edit", () => {
		const createHtml = renderToStaticMarkup(<TestBuilderShell mode="create" />);
		expect(createHtml).toContain("Soát đáp án");
		const editHtml = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={editTest} />,
		);
		expect(editHtml).toContain("Soát đáp án");
		// Mặc định đóng — panel không render cho đến khi bấm toggle.
		expect(createHtml).not.toContain("View All Answers");
	});
});

describe("TestBuilderShell preset extensibility (phase-06 Task 6.3)", () => {
	/**
	 * Slot layout phải đến từ ASSIGNMENT_TEST_PRESETS — render shell với test
	 * row của từng skill (edit mode khởi tạo header theo skill của test) và
	 * chứng minh cùng MỘT component cho ra 4 layout, không hard-code reading.
	 */
	const presetCase = (skill: string): KernelAssignmentTestRow => ({
		id: `at-${skill}`,
		title: `${skill} shell`,
		description: null,
		skill,
		timeLimitSeconds: null,
		collection: null,
		testGroup: null,
		status: "draft",
		parts: [],
	});

	it("reading: 3 slot Passage 1–3", () => {
		const html = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={presetCase("reading")} />,
		);
		expect(html).toContain("Parts (3 slot)");
		expect(html).toContain("0/3 parts · 0 questions");
		expect(html).toContain("Passage 1");
		expect(html).toContain("Passage 2");
		expect(html).toContain("Passage 3");
	});

	it("listening: 4 slot Section 1–4", () => {
		const html = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={presetCase("listening")} />,
		);
		expect(html).toContain("Parts (4 slot)");
		expect(html).toContain("0/4 parts · 0 questions");
		expect(html).toContain("Section 1");
		expect(html).toContain("Section 2");
		expect(html).toContain("Section 3");
		expect(html).toContain("Section 4");
	});

	it("writing: 2 slot Task 1/Task 2", () => {
		const html = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={presetCase("writing")} />,
		);
		expect(html).toContain("Parts (2 slot)");
		expect(html).toContain("0/2 parts · 0 questions");
		expect(html).toContain("Task 1");
		expect(html).toContain("Task 2");
	});

	it("speaking: 3 slot Part 1–3, time limit null hiển thị trống", () => {
		const html = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={presetCase("speaking")} />,
		);
		expect(html).toContain("Parts (3 slot)");
		expect(html).toContain("0/3 parts · 0 questions");
		expect(html).toContain("Part 1");
		expect(html).toContain("Part 2");
		expect(html).toContain("Part 3");
		// timeLimitSeconds null → input rỗng (để trống được, contract nullable).
		const timeInput = html.match(
			/input[^>]*placeholder="60:00"[^>]*value="([^"]*)"/,
		);
		expect(timeInput).not.toBeNull();
		expect(timeInput?.[1]).toBe("");
	});
});

describe("TestBuilderShell — Chỉnh sửa & Cập nhật đề bảo toàn explanation (#571)", () => {
	it("bấm Chỉnh sửa nạp explanation vào composer và Cập nhật đề gửi PATCH không kèm skill/part", async () => {
		submitFixture.run.mockResolvedValue({
			kind: "refreshed",
			id: "prompt-edit",
		});
		const smallEditTest: KernelAssignmentTestRow = {
			...editTest,
			parts: [
				{
					testId: "at-1",
					promptId: "prompt-edit",
					part: "p1",
					position: 0,
					qStartOverride: null,
				},
			],
		};
		render(<TestBuilderShell mode="edit" test={smallEditTest} />);

		fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
		expect(screen.getByText("Giải thích câu 1")).toBeTruthy();

		// #630 field-diff: chỉ câu hỏi THẬT SỰ đổi mới nằm trên PATCH —
		// đổi đáp án câu 1 (TRUE → FALSE) qua lưới đáp án.
		fireEvent.click(screen.getByRole("button", { name: "Câu 1: FALSE" }));
		fireEvent.click(screen.getByRole("button", { name: "Cập nhật đề" }));
		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		const action = submitFixture.run.mock.calls[0]?.[0] as {
			type: string;
			promptId: string;
			payload: Record<string, unknown>;
		};
		expect(action.type).toBe("update-assignment-prompt");
		expect(action.promptId).toBe("prompt-edit");
		expect("skill" in action.payload).toBe(false);
		expect("part" in action.payload).toBe(false);
		expect(assignmentPromptUpdateSchema.safeParse(action.payload).success).toBe(
			true,
		);
		const patchedQuestions = action.payload.questions as Array<{
			explanation?: string;
		}>;
		expect(patchedQuestions[0]?.explanation).toBe(
			"<p>Giải thích gốc câu 1</p>",
		);
		expect("explanation" in (patchedQuestions[1] ?? {})).toBe(false);
		// Các field khóa nội dung khác không đổi → omitted khỏi PATCH (#630).
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
			"optionBank",
			"note",
			"writing",
		]) {
			expect(key in action.payload).toBe(false);
		}
	}, 20_000);

	it("#630: Cập nhật đề KHÔNG sửa gì → PATCH chỉ còn title/band/source/status, writing omitted", async () => {
		submitFixture.run.mockResolvedValue({
			kind: "refreshed",
			id: "prompt-edit",
		});
		const smallEditTest: KernelAssignmentTestRow = {
			...editTest,
			parts: [
				{
					testId: "at-1",
					promptId: "prompt-edit",
					part: "p1",
					position: 0,
					qStartOverride: null,
				},
			],
		};
		render(<TestBuilderShell mode="edit" test={smallEditTest} />);

		fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
		fireEvent.click(screen.getByRole("button", { name: "Cập nhật đề" }));

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		const action = submitFixture.run.mock.calls[0]?.[0] as {
			type: string;
			promptId: string;
			payload: Record<string, unknown>;
		};
		expect(action.type).toBe("update-assignment-prompt");
		expect(action.promptId).toBe("prompt-edit");
		expect(Object.keys(action.payload).sort()).toEqual([
			"band",
			"source",
			"status",
			"title",
		]);
		// prompt-edit không có phần writing → writing phải omitted, không
		// bao giờ gửi `writing: null` vô điều kiện như trước.
		expect("writing" in action.payload).toBe(false);
		expect(assignmentPromptUpdateSchema.safeParse(action.payload).success).toBe(
			true,
		);
	}, 20_000);

	it("Cập nhật đề KHÔNG sửa gì khi câu hỏi chỉ lệch null/undefined (#632)", async () => {
		submitFixture.run.mockResolvedValue({
			kind: "refreshed",
			id: "prompt-edit",
		});
		const smallEditTest: KernelAssignmentTestRow = {
			...editTest,
			parts: [
				{
					testId: "at-1",
					promptId: "prompt-edit",
					part: "p1",
					position: 0,
					qStartOverride: null,
				},
			],
		};
		render(<TestBuilderShell mode="edit" test={smallEditTest} />);

		fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
		fireEvent.click(screen.getByRole("button", { name: "Cập nhật đề" }));

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		const action = submitFixture.run.mock.calls[0]?.[0] as {
			type: string;
			promptId: string;
			payload: Record<string, unknown>;
		};
		expect("questions" in action.payload).toBe(false);
	}, 20_000);
});

describe("TestBuilderShell — rollback state khi persistParts thất bại (#633)", () => {
	it("gỡ part bị từ chối 409 definite-failure → slot hoàn nguyên về prompt cũ", async () => {
		submitFixture.run.mockResolvedValue({
			kind: "definite-failure",
			status: 409,
		});
		render(<TestBuilderShell mode="edit" test={editTest} />);

		expect(screen.getByText("Passage 1 — Stepwells")).toBeDefined();

		const removeBtn = screen.getByRole("button", { name: "Gỡ khỏi test" });
		fireEvent.click(removeBtn);

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		await waitFor(() => {
			// Do rollback, "Passage 1 — Stepwells" vẫn tồn tại trong outline
			expect(screen.getByText("Passage 1 — Stepwells")).toBeDefined();
		});
	});

	it("gán part bị từ chối 409 definite-failure → slot hoàn nguyên về trống", async () => {
		submitFixture.run.mockResolvedValue({
			kind: "definite-failure",
			status: 409,
		});
		render(<TestBuilderShell mode="edit" test={editTest} />);

		const pickButtons = screen.getAllByRole("button", {
			name: "Chọn từ ngân hàng",
		});
		const firstPick = pickButtons[0];
		if (!firstPick) throw new Error("pick button not found");
		fireEvent.click(firstPick);
		const promptOption = screen.getByText("Passage 2 — Glass");
		fireEvent.click(promptOption);

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		await waitFor(() => {
			// Do rollback, Passage 2 vẫn là slot trống với nút Chọn từ ngân hàng
			expect(
				screen.getAllByRole("button", { name: "Chọn từ ngân hàng" }).length,
			).toBe(2);
		});
	});

	it("gỡ part trả outcome-unknown → KHÔNG rollback state (chờ reconcile)", async () => {
		submitFixture.run.mockResolvedValue({
			kind: "outcome-unknown",
		});
		render(<TestBuilderShell mode="edit" test={editTest} />);

		const removeBtn = screen.getByRole("button", { name: "Gỡ khỏi test" });
		fireEvent.click(removeBtn);

		expect(submitFixture.run).toHaveBeenCalledTimes(1);
		await act(async () => {});
		// Không rollback → slot 1 trở thành trống
		expect(screen.queryByText("Passage 1 — Stepwells")).toBeNull();
	});
});
