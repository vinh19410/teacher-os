// @vitest-environment jsdom

import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell as SharedShell } from "@teacher-os/ui/components/app-shell/app-shell";
import type {
	NavGroup,
	ShellLinkProps,
} from "@teacher-os/ui/components/app-shell/nav-group";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("@/lib/auth-client", () => ({
	authClient: { signOut: vi.fn() },
	getServerUrl: (base?: string) => base ?? "http://localhost:8000",
}));

import { AppShell } from "./app-shell";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
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
	onClick,
	children,
}: ShellLinkProps) {
	return (
		<a
			href={href}
			className={className}
			aria-current={ariaCurrent}
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
			crumbs={["Teacher/OS", "Lớp học"]}
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
		expect(drawer.className).toContain("translate-x-0");
	});

	it("closes on Escape and returns focus to the menu button", () => {
		const drawer = openDrawer();
		const menuButton = screen.getByRole("button", {
			name: "Open navigation",
		});
		fireEvent.keyDown(document, { key: "Escape" });
		expect(drawer.className).toContain("-translate-x-full");
		expect(document.activeElement).toBe(menuButton);
	});

	it("closes on overlay click and on item select", () => {
		const { onSelect } = renderSharedShell();
		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		const overlay = document.querySelector('div[role="presentation"]');
		expect(overlay).not.toBeNull();
		fireEvent.click(overlay as Element);
		const drawer = screen.getByRole("complementary", { hidden: true });
		expect(drawer.className).toContain("-translate-x-full");

		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
		fireEvent.click(screen.getByRole("link", { name: "Tổng quan" }));
		expect(onSelect).toHaveBeenCalledWith("overview");
		expect(drawer.className).toContain("-translate-x-full");
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
		expect(breadcrumb.textContent).toContain("Teacher/OS");
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

	it("renders the v2 nav groups with app labels kept for e2e", async () => {
		renderWebShell("/_auth/dashboard", "/dashboard");
		await screen.findByText("Giảng dạy");
		expect(screen.getByText("IELTS")).toBeTruthy();
		expect(screen.getByText("Kinh doanh")).toBeTruthy();
		// Nhãn app giữ nguyên (accessible name e2e — spec syllabus/tuition).
		expect(screen.getByRole("link", { name: "Syllabus" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Doanh thu" })).toBeTruthy();
	});
});
