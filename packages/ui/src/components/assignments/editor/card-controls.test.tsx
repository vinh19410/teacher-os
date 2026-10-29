import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CardControls } from "./card-controls";

describe("CardControls (#424 Task 1.4)", () => {
	it("không truyền callback → không render nút nào", () => {
		const html = renderToStaticMarkup(<CardControls label="câu 4" />);
		expect(html).not.toContain("aria-label");
		expect(html).not.toContain("<button");
	});

	it("render đủ nút với aria-label đúng khi có callback", () => {
		const html = renderToStaticMarkup(
			<CardControls
				label="câu 4"
				open
				onToggle={vi.fn()}
				onMoveUp={vi.fn()}
				onMoveDown={vi.fn()}
				onRemove={vi.fn()}
			/>,
		);
		expect(html).toContain('aria-label="Thu gọn câu 4"');
		expect(html).toContain('aria-expanded="true"');
		expect(html).toContain('aria-label="Đưa câu 4 lên"');
		expect(html).toContain('aria-label="Đưa câu 4 xuống"');
		expect(html).toContain('aria-label="Xóa câu 4"');
		// Nút xóa dùng màu destructive.
		expect(html).toContain("text-destructive");
	});

	it("hàng đóng: Mở {label} + aria-expanded=false", () => {
		const html = renderToStaticMarkup(
			<CardControls label="câu 4" open={false} onToggle={vi.fn()} />,
		);
		expect(html).toContain('aria-label="Mở câu 4"');
		expect(html).toContain('aria-expanded="false"');
		expect(html).not.toContain("Đưa câu 4");
	});

	it("canMoveUp/canMoveDown=false ẩn nút di chuyển dù có callback", () => {
		const html = renderToStaticMarkup(
			<CardControls
				label="câu 4"
				onMoveUp={vi.fn()}
				onMoveDown={vi.fn()}
				canMoveUp={false}
				canMoveDown={false}
			/>,
		);
		expect(html).not.toContain("Đưa câu 4 lên");
		expect(html).not.toContain("Đưa câu 4 xuống");
	});
});
