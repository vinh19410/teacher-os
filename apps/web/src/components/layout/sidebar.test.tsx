import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

import { extractUserPlan } from "./sidebar";

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

describe("Sidebar component contract", () => {
	const src = readFileSync(new URL("./sidebar.tsx", import.meta.url), "utf-8");

	it("does not hardcode the PRO badge", () => {
		// Ensures no static PRO badge literal is rendered in sidebar
		expect(src).not.toMatch(/>\s*PRO\s*<\/span>/);
	});

	it("renders plan badge conditionally with data-testid='sidebar-user-plan'", () => {
		expect(src).toMatch(/\{plan && \(/);
		expect(src).toMatch(/data-testid="sidebar-user-plan"/);
		expect(src).toMatch(/\{plan\}/);
	});

	it("provides title hover attribute on user displayName", () => {
		expect(src).toMatch(/<span[^>]*title=\{displayName\}/);
	});

	it("provides title hover attribute on user email", () => {
		expect(src).toMatch(
			/data-testid="sidebar-user-email"[^>]*title=\{user\.email\}/,
		);
	});

	it("provides accessible aria-label and title on profile Link", () => {
		expect(src).toMatch(/to="\/profile"/);
		expect(src).toMatch(/aria-label="Hồ sơ cá nhân"/);
		expect(src).toMatch(/title=\{[\s\S]*Hồ sơ cá nhân/);
	});

	it("uses flex-1 min-w-0 to maximize available horizontal space", () => {
		expect(src).toMatch(/to="\/profile"[\s\S]*?flex-1/);
	});
});
