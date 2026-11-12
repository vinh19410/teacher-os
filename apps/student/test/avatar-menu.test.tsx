// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: { signOut: vi.fn() },
}));

import { AvatarMenuContent } from "@/components/layout/avatar-menu";

// Shell v2: trigger avatar do UserFooter (packages/ui) quản — component này
// chỉ là nội dung menu tài khoản mở từ footer (thông tin + Đăng xuất).
describe("AvatarMenuContent", () => {
	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.unstubAllGlobals();
	});

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

	it("clears active_student_org_id and user key when clicking sign-out (#675)", async () => {
		const assignSpy = vi.fn();
		vi.stubGlobal("location", {
			...window.location,
			assign: assignSpy,
		});
		localStorage.setItem("active_student_org_id", "org-old");
		localStorage.setItem("active_student_user_id", "user-old");

		render(<AvatarMenuContent name="Vinh Tran" email="vinh@test.local" />);
		fireEvent.click(screen.getByRole("menuitem", { name: /Đăng xuất/i }));

		await waitFor(() => {
			expect(localStorage.getItem("active_student_org_id")).toBeNull();
		});
		expect(localStorage.getItem("active_student_user_id")).toBeNull();
		expect(assignSpy).toHaveBeenCalledWith("/login");
	});
});
