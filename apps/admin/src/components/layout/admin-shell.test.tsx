import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let mockAdmin: { id: string; name: string; email: string } = {
	id: "admin-1",
	name: "Admin",
	email: "admin@e2e.local",
};

vi.mock("@tanstack/react-router", () => ({
	useRouteContext: () => ({ admin: mockAdmin }),
	Outlet: () => <div data-testid="outlet-stub" />,
	Link: ({
		to,
		activeProps,
		children,
		...rest
	}: {
		to: string;
		activeProps?: Record<string, unknown>;
		children?: ReactNode;
		className?: string;
	}) => (
		<a
			href={to}
			{...(activeProps?.["data-active"] ? { "data-active": "true" } : {})}
			{...rest}
		>
			{children}
		</a>
	),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

import { AdminShell } from "./admin-shell";

describe("AdminShell sidemenu & header layout", () => {
	it("stretches sidebar items on desktop and constrains width without centering overflow", () => {
		mockAdmin = { id: "admin-1", name: "Admin", email: "admin@e2e.local" };
		const html = renderToStaticMarkup(<AdminShell />);

		const asideMatch = html.match(/<aside[^>]*>/);
		expect(asideMatch).not.toBeNull();
		const asideTag = asideMatch?.[0] ?? "";
		expect(asideTag).toContain('aria-label="Điều hướng quản trị"');
		expect(asideTag).toContain("md:items-stretch");
		expect(asideTag).toMatch(/\b(?:md:)?shrink-0\b/);
		expect(asideTag).toContain("md:w-64");
		expect(asideTag).toContain("bg-sidebar");
		expect(asideTag).toContain("border-sidebar-border");
	});

	it("keeps brand header constrained inside sidebar and wraps cleanly on mobile", () => {
		const html = renderToStaticMarkup(<AdminShell />);

		expect(html).toContain('title="Cô Mỹ Dạy Tiếng Anh · Quản trị"');
		expect(html).toMatch(
			/<div class="[^"]*\bmin-w-0\b[^"]*\bbasis-60\b[^"]*\bmd:w-full\b[^"]*"/,
		);
		const brandSpanMatch = html.match(
			/<span class="[^"]*" title="Cô Mỹ Dạy Tiếng Anh · Quản trị">/,
		);
		expect(brandSpanMatch).not.toBeNull();
		const brandSpanTag = brandSpanMatch?.[0] ?? "";
		expect(brandSpanTag).toMatch(/\bmin-w-0\b/);
		expect(brandSpanTag).toMatch(/\bflex-1\b/);
		expect(brandSpanTag).toMatch(/\bleading-tight\b/);
		expect(brandSpanTag).not.toMatch(/\b(?:truncate|whitespace-nowrap)\b/);
		expect(html).toContain(">Admin<");
	});

	it("stretches nav full-width on desktop and preserves active nav link contract", () => {
		const html = renderToStaticMarkup(<AdminShell />);

		expect(html).toMatch(/<nav class="[^"]*\bmd:w-full\b[^"]*">/);
		expect(html).toContain('href="/library/tests"');
		expect(html).toContain('data-active="true"');
		expect(html).toContain("data-[active]:bg-sidebar-accent");
		expect(html).toContain("data-[active]:font-medium");
		expect(html).toContain("Thư viện đề");
	});

	it("protects header name truncation and sign-out button against narrow viewports, falling back to email", () => {
		mockAdmin = {
			id: "admin-2",
			name: "",
			email: "very-long-admin-account@e2e.local",
		};
		const html = renderToStaticMarkup(<AdminShell />);

		expect(html).toMatch(/<header class="[^"]*\bgap-3\b[^"]*">/);
		expect(html).toMatch(
			/<div class="[^"]*\bmin-w-0\b[^"]*\btruncate\b[^"]*">very-long-admin-account@e2e\.local<\/div>/,
		);
		expect(html).toMatch(
			/<button[^>]*class="[^"]*\bshrink-0\b[^"]*"[^>]*>[\s\S]*Đăng xuất<\/button>/,
		);
	});
});
