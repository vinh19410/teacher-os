import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserFooter } from "./user-footer";

afterEach(() => {
	cleanup();
});

const baseUser = {
	name: "Nguyễn Văn A",
	email: "a@example.com",
	initials: "NA",
	label: "Hồ sơ cá nhân",
};

describe("UserFooter", () => {
	it("trailing là node anh em với control trong cùng wrapper flex (không lồng vào link)", () => {
		render(
			<UserFooter
				user={{
					...baseUser,
					href: "/profile",
					emailTestId: "sidebar-user-email",
					trailing: (
						<button type="button" aria-label="Đăng xuất">
							out
						</button>
					),
				}}
			/>,
		);

		const link = screen.getByRole("link", { name: baseUser.label });
		const logout = screen.getByRole("button", { name: "Đăng xuất" });

		// Nút đăng xuất không được lồng vào link hồ sơ (button trong <a> là
		// HTML không hợp lệ và làm hỏng click đăng xuất).
		expect(logout.closest("a")).toBeNull();
		// Cùng parent = cùng hàng flex; trailing phải là node cuối wrapper.
		const wrapper = logout.parentElement;
		expect(wrapper).toBe(link.parentElement);
		if (!wrapper) throw new Error("wrapper không tồn tại");
		const siblings = [...wrapper.children];
		expect(siblings[siblings.length - 1]).toBe(logout);
		expect(siblings).toHaveLength(2);
		// Wrapper là flex container (invariant bố cục một hàng).
		expect(wrapper.classList.contains("flex")).toBe(true);
		// Testid email giữ nguyên cho e2e.
		expect(screen.getByTestId("sidebar-user-email")).toBeTruthy();
	});

	it("không có trailing: wrapper chỉ chứa control, không thêm node thừa", () => {
		const { container } = render(
			<UserFooter user={{ ...baseUser, href: "/profile" }} />,
		);

		const link = screen.getByRole("link", { name: baseUser.label });
		const onlyWrapper = link.parentElement;
		if (!onlyWrapper) throw new Error("wrapper không tồn tại");
		expect(onlyWrapper.children).toHaveLength(1);
		expect(screen.queryByRole("button", { name: "Đăng xuất" })).toBeNull();
		// Vẫn là flex container (student dùng cùng component, bố cục không đổi).
		expect(onlyWrapper.classList.contains("flex")).toBe(true);
		expect(container.querySelector("a")?.getAttribute("href")).toBe("/profile");
	});

	it("control button + menu: bấm mở popover, Escape đóng (wrapper ref vẫn hoạt động)", () => {
		render(
			<UserFooter
				user={{
					...baseUser,
					menu: <div>menu-đăng-xuất</div>,
				}}
			/>,
		);

		const control = screen.getByRole("button", { name: baseUser.label });
		expect(screen.queryByText("menu-đăng-xuất")).toBeNull();
		// Không có trailing: wrapper chỉ chứa control (không thêm node thừa).
		expect(control.parentElement?.children).toHaveLength(1);

		fireEvent.click(control);
		expect(control.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText("menu-đăng-xuất")).toBeTruthy();

		// Menu popover phải ở trong wrapper `relative` — nếu `relative` bị bỏ,
		// popover neo vào aside `fixed` và nhảy khỏi sidebar.
		const menuHost = screen.getByText("menu-đăng-xuất").parentElement;
		if (!menuHost) throw new Error("menu host không tồn tại");
		expect(menuHost.classList.contains("absolute")).toBe(true);
		expect(menuHost.parentElement).toBe(control.parentElement);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(control.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("menu-đăng-xuất")).toBeNull();
	});

	it("collapsed: wrapper xếp dọc ở rail (lg:flex-col), control giữ hit-area full (lg:w-full)", () => {
		render(
			<UserFooter
				collapsed
				user={{
					...baseUser,
					href: "/profile",
					trailing: (
						<button type="button" aria-label="Đăng xuất">
							out
						</button>
					),
				}}
			/>,
		);

		const link = screen.getByRole("link", { name: baseUser.label });
		const logout = screen.getByRole("button", { name: "Đăng xuất" });
		const wrapper = link.parentElement;
		if (!wrapper) throw new Error("wrapper không tồn tại");

		// Rail thu gọn 64px: avatar rồi nút đăng xuất, xếp dọc dưới 1024px
		// vẫn là hàng ngang (lg:* chỉ áp dụng desktop).
		expect(wrapper.classList.contains("lg:flex-col")).toBe(true);
		expect(link.className).toContain("lg:w-full");
		expect(logout.closest("a")).toBeNull();
	});
});
