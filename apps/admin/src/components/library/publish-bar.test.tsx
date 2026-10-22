// @vitest-environment jsdom
import type { LibraryPartIssue } from "@teacher-os/api/library-contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { formatIssue } from "./part-issues";
import { PublishBar } from "./publish-bar";

const issues: LibraryPartIssue[] = [
	{ path: "parts.s1.audio", message: "audio required" },
	{ path: "parts.p2.questions.1.pin", message: "pin required" },
	{ path: "parts.p3", message: "missing part p3" },
];

describe("formatIssue (dịch lý do sang tiếng Việt)", () => {
	it("ghép nhãn slot + dịch message", () => {
		expect(formatIssue(issues[0], "listening")).toBe(
			"Section 1 · Audio — Chưa có file audio cho part này.",
		);
		expect(formatIssue(issues[1], "reading")).toBe(
			"Passage 2 · Câu hỏi 2 · Ghim trên ảnh — Câu này chưa đặt ghim trên ảnh.",
		);
		expect(formatIssue(issues[2], "reading")).toBe(
			"Passage 3 — Thiếu part — chưa có nội dung ở slot này.",
		);
	});

	it("message lạ → giữ nguyên văn (không giấu thông tin server)", () => {
		expect(
			formatIssue({ path: "passage", message: "weird rule" }, "reading"),
		).toBe("Passage — weird rule");
	});
});

describe("PublishBar (render tĩnh)", () => {
	it("nháp: nút Xuất bản bật, Hạ về nháp khóa", () => {
		const html = renderToStaticMarkup(
			<PublishBar
				status="draft"
				issues={[]}
				busy={false}
				skill="listening"
				onPublish={vi.fn()}
				onUnpublish={vi.fn()}
			/>,
		);
		expect(html).toContain("Nháp");
		expect(html).toContain("Xuất bản");
		expect(html).toContain("Hạ về nháp");
		expect(html).toContain("disabled");
	});

	it("ready: nút Xuất bản khóa, badge Đã xuất bản", () => {
		const html = renderToStaticMarkup(
			<PublishBar
				status="ready"
				issues={[]}
				busy={false}
				skill="reading"
				onPublish={vi.fn()}
				onUnpublish={vi.fn()}
			/>,
		);
		expect(html).toContain("Đã xuất bản");
	});

	it("busy → cả hai nút khóa", () => {
		const html = renderToStaticMarkup(
			<PublishBar
				status="draft"
				issues={[]}
				busy
				skill="reading"
				onPublish={vi.fn()}
				onUnpublish={vi.fn()}
			/>,
		);
		expect(html).toContain("Đang xử lý…");
	});
});
