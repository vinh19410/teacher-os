import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarMenu } from "@/components/layout/avatar-menu";

// Redesign phase 6: shell học viên chuyển sang header (design StudentPortal)
// — menu avatar chỉ còn 1 biến singular; tên đầy đủ nằm ở header, nút chỉ
// còn chữ cái đầu; tên/email xuất hiện trong menu khi mở.
describe("AvatarMenu", () => {
	it("renders initial-only trigger with accessible label", () => {
		const html = renderToStaticMarkup(
			<AvatarMenu name="Vinh Tran" email="vinh@test.local" />,
		);
		expect(html).toContain(">V</span>");
		expect(html).toContain('aria-label="Tài khoản học viên"');
		expect(html).toContain('aria-haspopup="menu"');
	});

	it("falls back to generic initial without a name", () => {
		const html = renderToStaticMarkup(<AvatarMenu />);
		expect(html).toContain(">H</span>");
	});
});
