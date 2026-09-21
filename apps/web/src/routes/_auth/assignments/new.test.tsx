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
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));
vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => submitFixture,
}));

import { NewAssignmentRoute } from "./new";

/**
 * SSR honesty guards for the prompt composer (#202, single-column #213):
 * Task 2 defaults render, the action bar carries the status chips, and
 * the bank column is gone from this page. Interaction paths (submit
 * dispatch) are covered by the server tests + the E2E specs — the node
 * vitest env has no DOM.
 */
describe("NewAssignmentRoute (issue #202)", () => {
	it("renders design v3 structure with Task 2 · Discuss defaults", () => {
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thêm đề vào ngân hàng");
		expect(html).toContain("Writing Academic");
		expect(html).toContain("Task 2 · 250 từ");
		expect(html).toContain("Discuss both views");
		// action copy for the ready state
		expect(html).toContain("Sẵn sàng lưu vào ngân hàng");
		// #213: single column — status chips moved into the action bar, and
		// the bank column is gone from this page entirely.
		expect(html).toContain("Trạng thái");
		expect(html).toContain("Bản nháp");
		expect(html).toContain("Sẵn sàng giao");
		expect(html).not.toContain("Xem trước phía học viên");
		expect(html).not.toContain("Đề đã có");
		// "Chưa giao lớp" is valid action-bar copy; the removed card's tells
		// are its own strings:
		expect(html).not.toContain("Đề này chỉ được thêm vào ngân hàng");
		expect(html).not.toContain("Chưa có đề nào trong ngân hàng.");
		// submit enabled by default (prefilled) — attribute absent
		const submit = html.match(
			/<button[^>]*type="submit"[^>]*>[^<]*Lưu vào ngân hàng/,
		);
		expect(submit?.[0]).toBeDefined();
		expect(submit?.[0]).not.toMatch(/\sdisabled=/);
	});

	it("surfaces the server error from the submit hook", () => {
		submitFixture.error =
			"Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại.";
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Không lưu được");
		submitFixture.error = undefined;
	});
});
