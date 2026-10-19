// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

const session: { user: Record<string, unknown> } = { user: {} };

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useRouteContext: () => ({ session: { data: { user: session.user } } }),
	redirect: (opts: unknown) => opts,
	Link: ({
		to,
		children,
		onClick: _onClick,
		...rest
	}: {
		to: string;
		children?: React.ReactNode;
		onClick?: unknown;
	} & Record<string, unknown>) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));

import { extractUserPlan, Sidebar } from "./sidebar";

describe("extractUserPlan", () => {
	it("returns null for non-object, null, or undefined user", () => {
		expect(extractUserPlan(null)).toBeNull();
		expect(extractUserPlan(undefined)).toBeNull();
		expect(extractUserPlan("not an object")).toBeNull();
		expect(extractUserPlan(123)).toBeNull();
	});

	it("returns null when user has no plan or tier property", () => {
		expect(
			extractUserPlan({
				id: "u1",
				name: "QA Dogfood",
				email: "qa@example.com",
			}),
		).toBeNull();
	});

	it("returns null when plan or tier is empty or whitespace", () => {
		expect(extractUserPlan({ plan: "" })).toBeNull();
		expect(extractUserPlan({ plan: "   " })).toBeNull();
		expect(extractUserPlan({ tier: "" })).toBeNull();
		expect(extractUserPlan({ tier: "   " })).toBeNull();
	});

	it("extracts plan when plan property is non-empty string", () => {
		expect(extractUserPlan({ plan: "PRO" })).toBe("PRO");
		expect(extractUserPlan({ plan: "BASIC" })).toBe("BASIC");
		expect(extractUserPlan({ plan: " VIP " })).toBe("VIP");
	});

	it("falls back to tier when plan is missing", () => {
		expect(extractUserPlan({ tier: "PRO" })).toBe("PRO");
		expect(extractUserPlan({ tier: "ENTERPRISE" })).toBe("ENTERPRISE");
	});

	it("prefers plan over tier if both exist", () => {
		expect(extractUserPlan({ plan: "PREMIUM", tier: "STANDARD" })).toBe(
			"PREMIUM",
		);
	});
});

describe("Sidebar profile footer", () => {
	function renderSidebar(user: Record<string, unknown>) {
		session.user = user;
		return renderToStaticMarkup(
			<Sidebar open={false} onNavigate={() => {}} collapsed={false} />,
		);
	}

	function profileLink(html: string): HTMLAnchorElement {
		const doc = new DOMParser().parseFromString(html, "text/html");
		const link = doc.querySelector('a[aria-label="Hồ sơ cá nhân"]');
		if (!link) throw new Error("profile link not rendered");
		return link as HTMLAnchorElement;
	}

	it("renders no plan badge for a user without a plan", () => {
		const html = renderSidebar({ name: "Cô Lan", email: "lan@example.com" });
		expect(html).not.toContain('data-testid="sidebar-user-plan"');
		expect(html).not.toMatch(/>\s*PRO\s*<\/span>/);
	});

	it("renders the user's own plan in the badge", () => {
		const link = profileLink(
			renderSidebar({ name: "Cô Lan", email: "lan@example.com", tier: "VIP" }),
		);
		const badge = link.querySelector('[data-testid="sidebar-user-plan"]');
		expect(badge?.textContent).toBe("VIP");
	});

	it("exposes the full name and email on hover for truncated text", () => {
		const link = profileLink(
			renderSidebar({ name: "Nguyễn Thị Lan", email: "lan@example.com" }),
		);
		expect(
			link.querySelector('span[title="Nguyễn Thị Lan"]')?.textContent,
		).toBe("Nguyễn Thị Lan");
		const email = link.querySelector('[data-testid="sidebar-user-email"]');
		expect(email?.getAttribute("title")).toBe("lan@example.com");
		expect(email?.textContent).toBe("lan@example.com");
	});

	it("links the footer to /profile with an accessible name and hover title", () => {
		const link = profileLink(
			renderSidebar({ name: "Nguyễn Thị Lan", email: "lan@example.com" }),
		);
		expect(link.getAttribute("href")).toBe("/profile");
		expect(link.getAttribute("title")).toBe("Nguyễn Thị Lan (lan@example.com)");
	});

	it("falls back to a generic teacher name when the user has none", () => {
		const link = profileLink(
			renderSidebar({ name: "", email: "x@example.com" }),
		);
		expect(link.querySelector('span[title="Giáo viên"]')).not.toBeNull();
	});

	it("lets the profile link take the remaining row width", () => {
		const link = profileLink(
			renderSidebar({ name: "Cô Lan", email: "lan@example.com" }),
		);
		expect(link.className.split(" ")).toEqual(
			expect.arrayContaining(["flex-1", "min-w-0"]),
		);
	});

	it("renders 'Từ vựng' (/vocab) above 'Lớp học' (/classes) in section 'Giảng dạy' (#363)", () => {
		const html = renderSidebar({ name: "Cô Lan", email: "lan@example.com" });
		const doc = new DOMParser().parseFromString(html, "text/html");
		const links = Array.from(doc.querySelectorAll("nav a"));
		const hrefs = links.map((a) => a.getAttribute("href"));
		const vocabIdx = hrefs.indexOf("/vocab");
		const classesIdx = hrefs.indexOf("/classes");
		expect(vocabIdx).toBeGreaterThanOrEqual(0);
		expect(classesIdx).toBeGreaterThan(vocabIdx);
		expect(links[vocabIdx]?.textContent).toContain("Từ vựng");
	});
});
