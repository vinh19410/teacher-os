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
vi.mock("@/lib/data-store", () => ({
	useData: () => ({
		data: {
			assignmentPrompts: [],
			classAssignments: [],
		},
	}),
}));

import { actionCopyFor, NewAssignmentRoute } from "./new";

describe("NewAssignmentRoute (#218 v5)", () => {
	it("renders design v5 structure with 4 skills and Task 2 Discuss defaults", () => {
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thêm đề vào ngân hàng");
		expect(html).toContain("Writing Academic");
		expect(html).toContain("Writing");
		expect(html).toContain("Reading");
		expect(html).toContain("Listening");
		expect(html).toContain("Speaking");
		expect(html).toContain("Task 2 · 250 từ");
		expect(html).toContain("Discuss both views");
		expect(html).toContain("Sẵn sàng lưu vào ngân hàng");
		expect(html).toContain("Trạng thái");
		expect(html).toContain("Bản nháp");
		expect(html).toContain("Sẵn sàng giao");
		expect(html).toContain("Xem trước");
		// Khung phải (card "Ngân hàng" + preview) đã bị bỏ — form chiếm toàn bộ chiều rộng.
		expect(html).not.toContain("Xem trước phía học viên");
		expect(html).not.toContain("Đề Writing đã có");

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

	describe("actionCopyFor priority states", () => {
		const baseValue = {
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Discuss both views",
			band: "7.0",
			source: "Cambridge 10",
			prompt: "Some prompt",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			note: "",
			items: [],
		};

		it("1. Missing title", () => {
			const res = actionCopyFor({ ...baseValue, title: "   " }, "ready");
			expect(res.title).toBe("Đặt tên đề rồi lưu vào ngân hàng.");
			expect(res.sub).toBe("Chưa giao lớp.");
		});

		it("2. Listening ready missing audio", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "listening",
					part: "s1",
					type: "form",
					audioName: "",
					items: [{ stem: "Q1", answer: "A", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu file nghe");
			expect(res.sub).toContain("Đính file hoặc dùng file mẫu");
		});

		it("3. Reading/Listening ready missing answers", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "tfng",
					passage: "Some passage",
					items: [
						{ stem: "Q1", answer: "TRUE", opts: null, alts: "" },
						{ stem: "Q2", answer: "", opts: null, alts: "" },
					],
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu đáp án chấm tự động");
			expect(res.sub).toContain("Khóa đáp án đúng");
		});

		it("4. Missing core content", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					prompt: "   ",
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu nội dung đề");
			expect(res.sub).toContain("Soạn xong rồi lưu vào ngân hàng");
		});

		it("5. Draft mode", () => {
			const res = actionCopyFor(baseValue, "draft");
			expect(res.title).toBe("Lưu bản nháp");
			expect(res.sub).toContain("Bản nháp chưa hiện");
		});

		it("6. Ready mode", () => {
			const res = actionCopyFor(baseValue, "ready");
			expect(res.title).toBe("Sẵn sàng lưu vào ngân hàng");
			expect(res.sub).toContain("Chưa giao lớp");
		});
	});
});
