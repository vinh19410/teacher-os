import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AssignmentPrompt } from "@/lib/mock-data";

const bank: AssignmentPrompt[] = [
	{
		id: "ap1",
		task: "task2",
		genre: "opinion",
		title: "Writing Task 2 — Opinion",
		band: "6.5",
		source: "Cambridge IELTS 11, Test 1",
		prompt: "Some people believe that unpaid community service…",
		note: "",
		status: "ready",
	},
];

const dataFixture = {
	students: [],
	lessons: [],
	invoices: [],
	assignments: [],
	assignmentPrompts: bank,
	reports: [],
	notifs: [],
	commentBank: [],
	classes: [],
	syllabi: [],
	enrollments: [],
};

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
vi.mock("@/lib/data-store", () => ({
	useData: () => ({ data: dataFixture }),
}));
vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => submitFixture,
}));

import { NewAssignmentRoute } from "./new";

/**
 * SSR honesty guards for the prompt composer (#202): the design v3
 * structure renders with Task 2 defaults, the bank list reflects the
 * kernel snapshot, and the action bar gates on missing fields.
 * Interaction paths (submit dispatch) are covered by the server tests
 * + the E2E spec — the node vitest env has no DOM.
 */
describe("NewAssignmentRoute (issue #202)", () => {
	it("renders design v3 structure with Task 2 · Discuss defaults", () => {
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thêm đề vào ngân hàng");
		expect(html).toContain("Writing Academic");
		expect(html).toContain("Task 2 · 250 từ");
		expect(html).toContain("Discuss both views");
		// preview spec line
		expect(html).toContain("Academic · 250 từ · 40 phút · Band 7.0");
		// action copy for the ready state
		expect(html).toContain("Sẵn sàng lưu vào ngân hàng");
		// submit enabled by default (prefilled) — attribute absent
		const submit = html.match(
			/<button[^>]*type="submit"[^>]*>[^<]*Lưu vào ngân hàng/,
		);
		expect(submit?.[0]).toBeDefined();
		expect(submit?.[0]).not.toMatch(/\sdisabled=/);
	});

	it("lists existing prompts from the kernel snapshot without fake usage tags", () => {
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Writing Task 2 — Opinion");
		expect(html).toContain("Sẵn sàng");
		expect(html).toContain("Cambridge IELTS 11, Test 1");
		expect(html).not.toContain("Đã dùng");
	});

	it("shows the empty-bank honest copy when the snapshot has no prompts", () => {
		dataFixture.assignmentPrompts = [];
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Chưa có đề nào trong ngân hàng.");
		dataFixture.assignmentPrompts = bank;
	});

	it("surfaces the server error from the submit hook", () => {
		submitFixture.error =
			"Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại.";
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Không lưu được");
		submitFixture.error = undefined;
	});
});
