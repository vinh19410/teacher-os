import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCachedSession } = vi.hoisted(() => ({
	mockGetCachedSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
		getCachedSession: mockGetCachedSession,
	},
	getCachedSession: mockGetCachedSession,
}));

import { Route } from "./route";

type BeforeLoadContext = Parameters<
	NonNullable<typeof Route.options.beforeLoad>
>[0];

describe("_auth route beforeLoad guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function callBeforeLoad(overrides: Partial<BeforeLoadContext>) {
		const beforeLoad = Route.options.beforeLoad;
		if (!beforeLoad) throw new Error("beforeLoad is undefined");
		const ctx = {
			location: { href: "/dashboard" },
			context: {},
			...overrides,
		} as unknown as BeforeLoadContext;
		return beforeLoad(ctx);
	}

	it("returns session when getCachedSession resolves with user data", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Teacher A", email: "a@test.local" },
				session: { id: "s-1" },
			},
		};
		mockGetCachedSession.mockResolvedValue(sampleSession);

		const result = await callBeforeLoad({
			location: {
				href: "/dashboard",
			} as unknown as BeforeLoadContext["location"],
		});

		expect(result).toEqual({ session: sampleSession });
	});

	it("redirects to /login carrying returnUrl when session has no data", async () => {
		mockGetCachedSession.mockResolvedValue({ data: null });

		await expect(
			callBeforeLoad({
				location: {
					href: "/grading",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				to: "/login",
				search: { returnUrl: "/grading" },
			},
		});
	});

	it("redirects to /login on network error", async () => {
		mockGetCachedSession.mockRejectedValue(new Error("Network timeout"));

		await expect(
			callBeforeLoad({
				location: {
					href: "/grading",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				to: "/login",
				search: { returnUrl: "/grading" },
			},
		});
	});
});
