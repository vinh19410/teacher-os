// @vitest-environment jsdom

import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell as SharedShell } from "@teacher-os/ui/components/app-shell/app-shell";
import type {
	NavGroup,
	ShellLinkProps,
} from "@teacher-os/ui/components/app-shell/nav-group";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { LayoutDashboard, School } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKernelQueryClient } from "@/lib/query-client";
import { snapshotFixture, startKernelServer } from "@/test/kernel-harness";
import { routerMock, routerState } from "@/test/router-mock";

const currentRoute = vi.hoisted(() => ({
	routeId: "/_auth/dashboard",
	pathname: "/dashboard",
}));

vi.mock("@tanstack/react-router", () => ({
	...routerMock(),
	Outlet: () => null,
	useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
		select({
			matches: [{ routeId: "/_auth" }, { routeId: currentRoute.routeId }],
			location: { pathname: currentRoute.pathname },
		}),
}));

const mockSignOut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
	authClient: { signOut: mockSignOut },
	getServerUrl: (base?: string) => base ?? "http://localhost:8000",
}));

import { AppShell } from "./app-shell";

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.unstubAllGlobals();
	mockSignOut.mockReset();
});

/* ───────── Shell dùng chung (packages/ui) — nav, drawer, focus ───────── */

const NAV: NavGroup[] = [
	{
		group: "Học tập",
		items: [
			{ key: "overview", label: "Tổng quan", icon: LayoutDashboard, href: "/" },
			{
				key: "practice",
				label: "Luyện tập",
				icon: School,
				href: "/practice",
				enabled: false,
			},
			{ key: "classes", label: "Lớp học", icon: School, href: "/classes" },
		],
	},
];

/** Link giả cho unit test — render <a> với aria-current từ shell. */
function StubLink({
	href,
	className,
	"aria-current": ariaCurrent,
	"aria-label": ariaLabel,
	title,
	onClick,
	children,
}: ShellLinkProps) {
	return (
		<a
			href={href}
			className={className}
			aria-current={ariaCurrent}
			aria-label={ariaLabel}
			title={title}
			onClick={onClick}
		>
			{children}
		</a>
	);
}

function renderSharedShell(
	overrides: Partial<Parameters<typeof SharedShell>[0]> = {},
) {
	const onSelect = vi.fn();
	const view = render(
		<SharedShell
			nav={NAV}
			activeKey="classes"
			onSelect={onSelect}
			crumbs={["Cô Mỹ Dạy Tiếng Anh", "Lớp học"]}
			linkComponent={StubLink}
			navLabel="Điều hướng học viên"
			{...overrides}
		>
			<p>body</p>
		</SharedShell>,
	);
	return { ...view, onSelect };
}

describe("Shared shell — nav group + aria-current", () => {
	it("renders group label, skips disabled items, marks active link", () => {
		renderSharedShell();
		expect(screen.getByText("Học tập")).toBeTruthy();
		const active = screen.getByRole("link", { name: "Lớp học" });
		expect(active.getAttribute("aria-current")).toBe("page");
		expect(active.className).toContain("bg-sidebar-accent");
		const inactive = screen.getByRole("link", { name: "Tổng quan" });
		expect(inactive.getAttribute("aria-current")).toBeNull();
		// enabled: false → item ẩn khỏi nav (flag theo phase)
		expect(screen.queryByRole("link", { name: "Luyện tập" })).toBeNull();
	});

	it("passes keys through onSelect when a nav item is chosen", () => {
		const { onSelect } = renderSharedShell();
		fireEvent.click(screen.getByRole("link", { name: "Tổng quan" }));
		expect(onSelect).toHaveBeenCalledWith("overview");
	});
});

describe("Shared shell — mobile drawer", () => {
	function openDrawer() {
		renderSharedShell();
		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		return screen.getByRole("complementary", { hidden: true });
	}

	it("opens the drawer with the menu button", () => {
		const drawer = openDrawer();
		expect(drawer.classList.contains("translate-x-0")).toBe(true);
		expect(drawer.classList.contains("visible")).toBe(true);
		expect(drawer.classList.contains("invisible")).toBe(false);
	});

	it("closes on Escape and returns focus to the menu button", () => {
		const drawer = openDrawer();
		const menuButton = screen.getByRole("button", {
			name: "Open navigation",
		});
		fireEvent.keyDown(document, { key: "Escape" });
		expect(drawer.classList.contains("-translate-x-full")).toBe(true);
		expect(drawer.classList.contains("invisible")).toBe(true);
		expect(document.activeElement).toBe(menuButton);
	});

	it("closes on overlay click and on item select", () => {
		const { onSelect } = renderSharedShell();
		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		const overlay = document.querySelector('div[role="presentation"]');
		expect(overlay).not.toBeNull();
		fireEvent.click(overlay as Element);
		const drawer = screen.getByRole("complementary", { hidden: true });
		expect(drawer.classList.contains("-translate-x-full")).toBe(true);
		expect(drawer.classList.contains("invisible")).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		fireEvent.click(screen.getByRole("link", { name: "Tổng quan" }));
		expect(onSelect).toHaveBeenCalledWith("overview");
		expect(drawer.classList.contains("-translate-x-full")).toBe(true);
		expect(drawer.classList.contains("invisible")).toBe(true);
	});

	it("hides closed off-canvas drawer below lg, isolates open drawer with focus/inert, and preserves user.menu with layered Escape", () => {
		renderSharedShell({
			user: {
				name: "Học viên Trung tâm Tài Liệu 1795543335456",
				email: "long.student@test.local",
				initials: "HV",
				label: "Tài khoản học viên",
				menu: <div>menu-tai-khoan</div>,
			},
		});

		const drawer = screen.getByRole("complementary", { hidden: true });
		const menuButton = screen.getByRole("button", {
			name: "Open navigation",
		});
		const contentWrapper = menuButton.closest("header")?.parentElement;
		if (!contentWrapper) throw new Error("contentWrapper không tồn tại");

		// Trạng thái đóng: ẩn hoàn toàn dưới lg, giữ desktop hiển thị từ lg trở lên.
		expect(drawer.classList.contains("overflow-hidden")).toBe(true);
		expect(drawer.classList.contains("invisible")).toBe(true);
		expect(drawer.classList.contains("lg:visible")).toBe(true);
		expect(drawer.classList.contains("pointer-events-none")).toBe(true);
		expect(drawer.classList.contains("lg:pointer-events-auto")).toBe(true);
		expect(drawer.classList.contains("shadow-none")).toBe(true);
		expect(drawer.classList.contains("-translate-x-full")).toBe(true);
		expect(drawer.classList.contains("motion-reduce:transition-none")).toBe(
			true,
		);
		expect(
			drawer.classList.contains("transition-[transform,translate,visibility]"),
		).toBe(true);
		expect(drawer.classList.contains("visible")).toBe(false);
		expect(drawer.classList.contains("translate-x-0")).toBe(false);
		expect(drawer.classList.contains("shadow-lg")).toBe(false);
		expect(menuButton.getAttribute("aria-expanded")).toBe("false");
		expect(contentWrapper.hasAttribute("inert")).toBe(false);

		// Mở drawer: hiển thị ngay visibility (không transition visibility để focus() không bị drop ở t=0), chuyển focus vào aside, khóa nền bằng inert.
		fireEvent.click(menuButton);
		expect(drawer.classList.contains("visible")).toBe(true);
		expect(drawer.classList.contains("translate-x-0")).toBe(true);
		expect(drawer.classList.contains("shadow-lg")).toBe(true);
		expect(drawer.classList.contains("transition-[transform,translate]")).toBe(
			true,
		);
		expect(
			drawer.classList.contains("transition-[transform,translate,visibility]"),
		).toBe(false);
		expect(drawer.classList.contains("invisible")).toBe(false);
		expect(drawer.classList.contains("pointer-events-none")).toBe(false);
		expect(drawer.classList.contains("shadow-none")).toBe(false);
		expect(drawer.classList.contains("-translate-x-full")).toBe(false);
		expect(menuButton.getAttribute("aria-expanded")).toBe("true");
		expect(document.activeElement).toBe(drawer);
		expect(contentWrapper.hasAttribute("inert")).toBe(true);

		// Mở user.menu (AvatarMenuContent) bên trong drawer không được đóng drawer.
		fireEvent.click(screen.getByRole("button", { name: "Tài khoản học viên" }));
		expect(screen.getByText("menu-tai-khoan")).toBeTruthy();
		expect(drawer.classList.contains("visible")).toBe(true);
		expect(drawer.classList.contains("invisible")).toBe(false);

		// Escape lần 1 chỉ đóng popover, giữ drawer mở.
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByText("menu-tai-khoan")).toBeNull();
		expect(drawer.classList.contains("visible")).toBe(true);

		// Escape lần 2 đóng drawer, gỡ inert và trả focus về nút menu.
		fireEvent.keyDown(document, { key: "Escape" });
		expect(drawer.classList.contains("invisible")).toBe(true);
		expect(drawer.classList.contains("-translate-x-full")).toBe(true);
		expect(
			drawer.classList.contains("transition-[transform,translate,visibility]"),
		).toBe(true);
		expect(menuButton.getAttribute("aria-expanded")).toBe("false");
		expect(contentWrapper.hasAttribute("inert")).toBe(false);
		expect(document.activeElement).toBe(menuButton);
	});

	it("auto-closes mobile drawer on resize to >= 64rem (lg) without focusing hidden mobile menu button", () => {
		let matches = false;
		const listeners = new Set<(event: MediaQueryListEvent) => void>();
		const matchMediaSpy = vi.fn((query: string) => {
			expect(query).toBe("(min-width: 64rem)");
			return {
				get matches() {
					return matches;
				},
				media: query,
				onchange: null,
				addEventListener: (
					_type: string,
					cb: (event: MediaQueryListEvent) => void,
				) => {
					listeners.add(cb);
				},
				removeEventListener: (
					_type: string,
					cb: (event: MediaQueryListEvent) => void,
				) => {
					listeners.delete(cb);
				},
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			} as unknown as MediaQueryList;
		});
		vi.stubGlobal("matchMedia", matchMediaSpy);

		renderSharedShell();
		const drawer = screen.getByRole("complementary", { hidden: true });
		const menuButton = screen.getByRole("button", {
			name: "Open navigation",
		});
		const contentWrapper = menuButton.closest("header")?.parentElement;
		if (!contentWrapper) throw new Error("contentWrapper không tồn tại");

		fireEvent.click(menuButton);
		expect(drawer.classList.contains("visible")).toBe(true);
		expect(contentWrapper.hasAttribute("inert")).toBe(true);
		expect(document.activeElement).toBe(drawer);

		act(() => {
			matches = true;
			for (const cb of listeners) {
				cb({
					matches: true,
					media: "(min-width: 64rem)",
				} as MediaQueryListEvent);
			}
		});

		expect(drawer.classList.contains("invisible")).toBe(true);
		expect(contentWrapper.hasAttribute("inert")).toBe(false);
		expect(document.activeElement).not.toBe(menuButton);
		expect(document.activeElement).not.toBe(drawer);
	});

	it("collapse toggle swaps aria-label and respects collapsed prop", () => {
		const onToggle = vi.fn();
		const { rerender } = renderSharedShell({ onToggleCollapse: onToggle });
		const toggle = screen.getByTestId("sidebar-toggle");
		expect(toggle.getAttribute("aria-label")).toBe("Thu gọn thanh điều hướng");
		fireEvent.click(toggle);
		expect(onToggle).toHaveBeenCalledTimes(1);

		rerender(
			<SharedShell
				nav={NAV}
				activeKey="classes"
				linkComponent={StubLink}
				onToggleCollapse={onToggle}
				collapsed
			>
				<p>body</p>
			</SharedShell>,
		);
		expect(
			screen.getByTestId("sidebar-toggle").getAttribute("aria-label"),
		).toBe("Mở rộng thanh điều hướng");
	});
});

/* ───────── Web shell — breadcrumb, footer user, e2e hooks ───────── */

function renderWebShell(routeId: string, pathname: string) {
	currentRoute.routeId = routeId;
	currentRoute.pathname = pathname;
	routerState.routeContext = {
		session: {
			data: {
				user: {
					name: "Cô Lan",
					email: "lan@example.com",
					// data URL hợp lệ để Avatar render <img> với hook e2e.
					image: "data:image/png;base64,iVBORw0KGgo=",
				},
			},
		},
	};
	startKernelServer(snapshotFixture());
	return render(
		<QueryClientProvider client={createKernelQueryClient()}>
			<AppShell />
		</QueryClientProvider>,
	);
}

describe("Web AppShell v2", () => {
	it("renders breadcrumb 'tổ chức › mục' from the route match", async () => {
		renderWebShell("/_auth/profile", "/profile");
		const breadcrumb = await screen.findByRole("navigation", {
			name: "Breadcrumb",
		});
		expect(breadcrumb.textContent).toContain("Cô Mỹ Dạy Tiếng Anh");
		expect(breadcrumb.textContent).toContain("Hồ sơ");
	});

	it("keeps the v1 e2e hooks in the sidebar footer", async () => {
		renderWebShell("/_auth/profile", "/profile");
		const email = await screen.findByTestId("sidebar-user-email");
		expect(email.textContent).toBe("lan@example.com");
		const footer = email.closest("a") as HTMLAnchorElement;
		expect(footer.getAttribute("href")).toBe("/profile");
		expect(footer.getAttribute("aria-label")).toBe("Hồ sơ cá nhân");
		expect(footer.textContent).not.toContain("Google");
		expect(screen.getByTestId("sidebar-avatar")).toBeTruthy();
	});

	it("hides VersionBadge visually with lg:sr-only when desktop sidebar is collapsed", async () => {
		window.localStorage.setItem("teacher-os.sidebar.collapsed", "true");
		renderWebShell("/_auth/dashboard", "/dashboard");
		const version = await screen.findByTestId("app-version");
		expect(version.parentElement?.classList.contains("lg:sr-only")).toBe(true);
	});

	it("renders the v2 nav groups with app labels kept for e2e", async () => {
		renderWebShell("/_auth/dashboard", "/dashboard");
		await screen.findByText("Giảng dạy");
		expect(screen.getByText("IELTS")).toBeTruthy();
		expect(screen.getByText("Kinh doanh")).toBeTruthy();
		// Nhãn app giữ nguyên (accessible name e2e — spec syllabus/tuition).
		expect(screen.getByRole("link", { name: "Syllabus" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Doanh thu" })).toBeTruthy();
	});

	it("signs out to root /login via window.location.assign on success and fallback", async () => {
		const assign = vi.fn();
		vi.stubGlobal("location", { ...window.location, assign });
		mockSignOut.mockImplementationOnce(
			({ fetchOptions }: { fetchOptions?: { onSuccess?: () => void } }) => {
				fetchOptions?.onSuccess?.();
				return Promise.resolve({ data: { success: true } });
			},
		);
		renderWebShell("/_auth/dashboard", "/teacher/dashboard");
		const signOutBtn = await screen.findByRole("button", { name: "Đăng xuất" });
		fireEvent.click(signOutBtn);
		await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
		expect(assign).toHaveBeenCalledWith("/login");
		expect(routerState.navigate).not.toHaveBeenCalled();

		// Fallback when signOut rejects without invoking onSuccess.
		assign.mockClear();
		mockSignOut.mockRejectedValueOnce(new Error("network"));
		fireEvent.click(signOutBtn);
		await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
		expect(assign).toHaveBeenCalledWith("/login");
	});
});
