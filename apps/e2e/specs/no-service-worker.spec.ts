import { expect, test } from "@playwright/test";
import { WEB_ORIGIN } from "./origins";

/**
 * No service worker may ship (issue #125): the vite-plugin-pwa SW broke SPA
 * boot (blank #app) and auth fetches in real browsers, and its precached
 * index.html served stale shells across deploys. The plugin is removed; these
 * stubs only exist to self-unregister the broken SW in browsers that already
 * have it. This spec opts into `serviceWorkers: "allow"` because the global
 * config blocks them — under "block" every assertion here would be
 * tautologically green.
 */
test.describe("no service worker ships", () => {
	test.use({ serviceWorkers: "allow" });

	const stubChecks: Array<{ file: string; bodyMustContain: string[] }> = [
		{ file: "sw.js", bodyMustContain: ["unregister", "caches.delete"] },
		{ file: "dev-sw.js", bodyMustContain: ["unregister", "caches.delete"] },
		// Served to stale shells that still reference it; must be real JS so
		// it can never re-register a workbox SW.
		{ file: "registerSW.js", bodyMustContain: [] },
	];

	for (const { file, bodyMustContain } of stubChecks) {
		test(`/${file} is real JavaScript, never the SPA fallback`, async ({
			request,
		}) => {
			const res = await request.get(`/${file}`);
			expect(res.status()).toBe(200);
			expect(res.headers()["content-type"]).toContain("text/javascript");
			const body = await res.text();
			for (const fragment of bodyMustContain) {
				expect(body).toContain(fragment);
			}
			// SPA fallback would return index.html markup.
			expect(body).not.toContain("<!doctype html");
		});
	}

	test("/sw.js cache headers keep the SW update check on the network", async ({
		request,
	}) => {
		const res = await request.get("/sw.js");
		const cacheControl = res.headers()["cache-control"] ?? "";
		// Any revalidate-before-reuse policy keeps the byte-diff update check
		// on the network (dev serves no-cache; Workers assets serve max-age=0).
		expect(cacheControl).toMatch(/max-age=0|no-store|no-cache/);
	});

	test("nothing registers a service worker on page load", async ({ page }) => {
		await page.goto("/");
		const count = await page.evaluate(() =>
			navigator.serviceWorker.getRegistrations().then((r) => r.length),
		);
		expect(count).toBe(0);
		expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBe(
			null,
		);
	});

	test("deployed /sw.js stub self-unregisters and drains caches", async ({
		page,
	}) => {
		// Behavioral guard: register the stub ourselves (nothing does it for us
		// anymore), seed a cache the activate step must delete, then require the
		// registration to drain to zero — if the stub is ever gutted, this fails.
		await page.goto("/login");
		await page.evaluate(async () => {
			// Workbox-named seed: the stub only purges workbox-prefixed caches.
			const cache = await caches.open("workbox-precache-v2-qc125-test");
			await cache.put("/seeded", new Response("x"));
			await navigator.serviceWorker.register("/sw.js");
		});
		await expect
			.poll(
				async () => {
					try {
						return await page.evaluate(() =>
							navigator.serviceWorker.getRegistrations().then((r) => r.length),
						);
					} catch {
						// The stub's client.navigate() reloads the page mid-poll; the
						// fresh document is part of the behavior under test. Any other
						// evaluate failure also lands here, so assert the page identity
						// below to keep a hijacked/lost page from faking a pass.
						return -1;
					}
				},
				{ timeout: 15_000 },
			)
			.toBe(0);
		expect(await page.url()).toContain(WEB_ORIGIN);
		const cachesLeft = await page.evaluate(() => caches.keys());
		expect(cachesLeft).toEqual([]);
		// A reload after the purge lands on a working, SW-free app.
		await page.goto("/login");
		await expect(
			page.getByRole("button", { name: "Create account" }),
		).toBeVisible();
	});
});
