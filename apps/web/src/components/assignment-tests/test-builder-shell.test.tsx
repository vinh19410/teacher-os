import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: {
			assignmentPrompts: [promptP1],
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
		expect(html).toContain("Gỡ khỏi test");
		expect(html).toContain("Chỉnh sửa");
		// Skill khóa ở edit mode.
		expect(html).toContain("Kỹ năng cố định theo parts đã gắn.");
		// Còn 2 slot trống.
		expect(html.match(/Chọn từ ngân hàng/g)?.length).toBe(2);
	});

	it("phase-04 Task 4.3: nút Xem trước có mặt ở cả create lẫn edit", () => {
		const createHtml = renderToStaticMarkup(<TestBuilderShell mode="create" />);
		expect(createHtml).toContain("Xem trước");
		const editHtml = renderToStaticMarkup(
			<TestBuilderShell mode="edit" test={editTest} />,
		);
		expect(editHtml).toContain("Xem trước");
	});
});
