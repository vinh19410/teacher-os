// @vitest-environment jsdom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKernelQueryClient } from "@/lib/query-client";
import { snapshotFixture, startKernelServer } from "@/test/kernel-harness";
import { routerState } from "@/test/router-mock";

const currentRoute = vi.hoisted(() => ({ routeId: "/_auth/dashboard" }));

vi.mock("@tanstack/react-router", async () => {
	const mock = (await import("@/test/router-mock")).routerMock();
	return {
		...mock,
		Outlet: () => null,
		useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
			select({
				matches: [{ routeId: "/_auth" }, { routeId: currentRoute.routeId }],
				location: { pathname: "/" },
			}),
	};
});

vi.mock("@/lib/auth-client", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth-client")>()),
	authClient: { signOut: vi.fn() },
}));

import { AppShell } from "./app-shell";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderShell(routeId: string) {
	currentRoute.routeId = routeId;
	routerState.routeContext = {
		session: { data: { user: { name: "Cô Lan", email: "lan@example.com" } } },
	};
	startKernelServer(snapshotFixture());
	return render(
		<QueryClientProvider client={createKernelQueryClient()}>
			<AppShell />
		</QueryClientProvider>,
	);
}

describe("AppShell topbar title", () => {
	it.each([
		["/_auth/profile", "Hồ sơ"],
		["/_auth/classes/$classId", "Lớp học"],
		["/_auth/tuition/$invoiceId", "Doanh thu"],
	])("titles %s as %s", async (routeId, title) => {
		renderShell(routeId);
		const header = (await screen.findByRole("banner")) as HTMLElement;
		expect(header.textContent).toContain(title);
	});

	it("shows the signed-in email in the sidebar, not a provider label", async () => {
		renderShell("/_auth/profile");
		const email = await screen.findByTestId("sidebar-user-email");
		expect(email.textContent).toBe("lan@example.com");
		// The sidebar footer link (topbar has an avatar-only shortcut too).
		const footer = email.closest("a") as HTMLAnchorElement;
		expect(footer.getAttribute("href")).toBe("/profile");
		expect(footer.textContent).not.toContain("Google");
	});
});
