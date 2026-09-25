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
import { actionCopyFor, NewAssignmentRoute } from "./new";

describe("NewAssignmentRoute (#218 v5)", () => {
	it("renders design v5 structure with 4 skills and a blank form", () => {
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thêm đề vào ngân hàng");
		expect(html).toContain("Writing Academic");
		expect(html).toContain("Writing");
		expect(html).toContain("Reading");
		expect(html).toContain("Listening");
		expect(html).toContain("Speaking");
		expect(html).toContain("Task 2 · 250 từ");
		expect(html).toContain("Discuss both views");
		expect(html).toContain("Đặt tên đề rồi lưu vào ngân hàng.");
		expect(html).toContain("Trạng thái");
		expect(html).toContain("Bản nháp");
		expect(html).toContain("Sẵn sàng giao");
		expect(html).toContain("Xem trước");
		// Form khởi tạo trắng: không còn nội dung mẫu hardcode.
		expect(html).not.toContain("Some people think");
		expect(html).not.toContain("Cambridge");
		// Khung phải (card "Ngân hàng" + preview) đã bị bỏ — form chiếm toàn bộ chiều rộng.
		expect(html).not.toContain("Xem trước phía học viên");
		expect(html).not.toContain("Đề Writing đã có");

		const submit = html.match(
			/<button[^>]*type="submit"[^>]*>[^<]*Lưu vào ngân hàng/,
		);
		expect(submit?.[0]).toBeDefined();
		expect(submit?.[0]).toMatch(/\sdisabled=/);
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
			imageUrl: "",
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
			expect(res.sub).toContain("Đính file nghe trước khi lưu");
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

		it("7. Reading diagram ready missing image (#269)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "diagram",
					passage: "Some passage",
					imageUrl: "",
					items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu ảnh biểu đồ");
			expect(res.sub).toContain("Dán link ảnh");
		});

		it("8. Reading image URL not https (#269)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "summary",
					passage: "Some passage",
					imageUrl: "http://example.com/diagram.png",
					items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Link ảnh chưa hợp lệ");
			expect(res.sub).toContain("https");
		});

		it("9. Reading image URL over 500 chars blocks save (#269)", () => {
			// Mirrors the server .max(500) — presigned CDN URLs blow past it.
			const longUrl = `https://example.com/${"a".repeat(490)}.png`;
			expect(longUrl.length).toBeGreaterThan(500);
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "summary",
					passage: "Some passage",
					imageUrl: longUrl,
					items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Link ảnh chưa hợp lệ");
			expect(res.sub).toContain("500 ký tự");
		});
	});

	it("blocks save for a restored diagram-ready draft missing its image (#269)", () => {
		draftFixture.value = {
			task: "p1",
			genre: "diagram",
			title: "Diagram draft",
			band: "7.0",
			source: "",
			prompt: "",
			note: "",
			status: "ready",
			skill: "reading",
			part: "p1",
			type: "diagram",
			passage: "Passage",
			intro: "",
			audioName: "",
			imageUrl: "",
			items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
		};
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thiếu ảnh biểu đồ");
		const submit = html.match(
			/<button[^>]*type="submit"[^>]*>[^<]*Lưu vào ngân hàng/,
		);
		expect(submit?.[0]).toMatch(/\sdisabled=/);
		draftFixture.value = null;
	});
});
