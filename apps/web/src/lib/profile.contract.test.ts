/**
 * Profile contract — locks the /profile wiring without rendering React
 * (source-parse, same style as kernel-runtime). Pins live only inside
 * apps/web; the server-side hook guard lives in packages/auth's own test.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string): string {
	return readFileSync(join(here, rel), "utf8");
}

describe("profile route", () => {
	const src = readSrc("../routes/_auth/profile.tsx");

	test("reads the session through the _auth route context", () => {
		expect(src).toMatch(/useRouteContext\(\{ from: "\/_auth" \}\)/);
	});

	test("updates via authClient.updateUser and toasts on the error branch", () => {
		expect(src).toMatch(/authClient\.updateUser/);
		expect(src).toMatch(/if \(error\) \{/);
		expect(src).not.toMatch(/toast\.success[^\n]*\n[^\n]*if \(error\)/);
	});

	test("validates the OAuth error search param", () => {
		expect(src).toMatch(/validateSearch/);
		expect(src).toMatch(/typeof search\.error === "string"/);
	});

	test("clears the error param with a URL path, never a routeId", () => {
		// `_auth` is pathless: navigating to "/_auth/profile" would 404.
		expect(src).toMatch(/to: "\/profile", search: \{\}, replace: true/);
		expect(src).not.toMatch(/to: "\/_auth\//);
	});
});

describe("google link card", () => {
	const src = readSrc("../components/profile/google-link-card.tsx");

	test("links Google with an absolute callbackURL (split-origin deploy)", () => {
		expect(src).toMatch(/authClient\.linkSocial/);
		expect(src).toMatch(/provider: "google"/);
		expect(src).toMatch(/window\.location\.origin[\s\S]*?callbackURL: base/);
		// A relative callback would resolve against the API origin and 404.
		expect(src).not.toMatch(/callbackURL: "\//);
	});

	test("surfaces the link failure instead of dying silently", () => {
		expect(src).toMatch(
			/const \{ error: linkError \} = await authClient\.linkSocial/,
		);
		expect(src).toMatch(/if \(linkError\) \{/);
	});

	test("renders all three states including a retryable load error", () => {
		expect(src).toMatch(/Đã kết nối/);
		expect(src).toMatch(/Kết nối Google/);
		expect(src).toMatch(/Thử lại/);
	});
});

describe("avatar section", () => {
	const src = readSrc("../components/profile/avatar-section.tsx");

	test("resets the hidden input so re-picking the same file fires change again", () => {
		expect(src).toMatch(/event\.target\.value = ""/);
	});

	test("uploads through updateUser with a visible error branch", () => {
		expect(src).toMatch(/fileToAvatarDataUrl/);
		expect(src).toMatch(/authClient\.updateUser\(\{ image: dataUrl \}\)/);
		expect(src).toMatch(/if \(error\) \{/);
	});

	test("carries the e2e hooks on the visible controls and the rendered img", () => {
		expect(src).toMatch(/data-testid": "profile-avatar"/);
		expect(src).toMatch(/data-testid="avatar-change-btn"/);
		expect(src).toMatch(/data-testid="avatar-input"/);
	});
});

describe("linked accounts hook", () => {
	const src = readSrc("../lib/use-linked-accounts.ts");

	test("checks providerId on real listAccounts results — no mocking", () => {
		expect(src).toMatch(/authClient\.listAccounts/);
		expect(src).toMatch(/providerId === "google"/);
	});

	test("exposes a retryable error state instead of swallowing failures", () => {
		expect(src).toMatch(/setError\(/);
		expect(src).toMatch(/reload/);
	});
});

describe("shell integration", () => {
	test("sidebar links the user block to /profile, shows email instead of a fake Google label", () => {
		const sidebar = readSrc("../components/layout/sidebar.tsx");
		expect(sidebar).toMatch(/to="\/profile"/);
		expect(sidebar).toMatch(/user\.email/);
		expect(sidebar).not.toMatch(/>Google<\/div>/);
	});

	test("settings replaces the fake teacher card with session truth + a profile link", () => {
		const settings = readSrc("../routes/_auth/settings.tsx");
		expect(settings).not.toMatch(/Trần Mai Lan/);
		expect(settings).not.toMatch(/0901 234 567/);
		expect(settings).not.toMatch(/lantran@gmail\.com/);
		expect(settings).toMatch(/to="\/profile"/);
		// Untouched on purpose.
		expect(settings).toMatch(/Gói dịch vụ/);
		expect(settings).toMatch(/unitPrice/);
	});

	test("the topbar title map knows the new route id", () => {
		const shell = readSrc("../components/layout/app-shell.tsx");
		expect(shell).toMatch(/"\/_auth\/profile": "Hồ sơ"/);
	});
});
