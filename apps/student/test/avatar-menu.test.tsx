// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: { signOut: vi.fn() },
}));

import { AvatarMenuContent } from "@/components/layout/avatar-menu";

// Shell v2: trigger avatar do UserFooter (packages/ui) quản — component này
// chỉ là nội dung menu tài khoản mở từ footer (thông tin + Đăng xuất).
describe("AvatarMenuContent", () => {
	it("renders account info with role badge and sign-out item", () => {
		const html = renderToStaticMarkup(
			<AvatarMenuContent name="Vinh Tran" email="vinh@test.local" />,
		);
		expect(html).toContain('role="menu"');
		expect(html).toContain("Vinh Tran");
		expect(html).toContain("vinh@test.local");
		expect(html).toContain("Học viên");
		expect(html).toContain("Đăng xuất");
		expect(html).toContain('role="menuitem"');
	});

	it("falls back to a generic student name without one", () => {
		const html = renderToStaticMarkup(<AvatarMenuContent />);
		expect(html).toContain("Học viên");
	});
});
