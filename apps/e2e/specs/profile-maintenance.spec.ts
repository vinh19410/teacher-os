import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const VIEWPORTS = [
	{ name: "desktop-1440x900", width: 1440, height: 900 },
	{ name: "tablet-768x1024", width: 768, height: 1024 },
	{ name: "mobile-375x812", width: 375, height: 812 },
] as const;

const serveEntryPath = fileURLToPath(
	new URL("../../profile/serve.mjs", import.meta.url).href,
);
const maintenanceJsonPath = fileURLToPath(
	new URL("../../profile/maintenance.json", import.meta.url).href,
);

function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = createNetServer();
		probe.unref();
		probe.on("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const addr = probe.address();
			if (!addr || typeof addr === "string" || addr.port <= 0) {
				probe.close(() => reject(new Error("Could not allocate free port")));
				return;
			}
			const { port } = addr;
			probe.close((err) => (err ? reject(err) : resolve(port)));
		});
	});
}

async function waitForServer(
	url: string,
	child: ChildProcess,
	stderrChunks: string[],
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(
				`Profile server exited early (${child.exitCode}): ${stderrChunks.join("")}`,
			);
		}
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			// Server still booting.
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error(
		`Profile maintenance server did not respond at ${url}: ${stderrChunks.join("")}`,
	);
}

async function stopChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.killed) return;
	child.kill("SIGTERM");
	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			resolve();
		}, 3_000);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

async function assertMaintenanceRendered(
	page: Page,
	baseUrl: string,
): Promise<void> {
	for (const route of ["/", "/kiem-tra-dau-vao/", "/noi-bo/"]) {
		await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
		await expect(
			page.getByRole("heading", {
				name: "Trang web đang trong quá trình phát triển",
			}),
		).toBeVisible();
		await expect(page.locator("a, button, form")).toHaveCount(0);
		const robotsContent = await page
			.locator('meta[name="robots"]')
			.getAttribute("content");
		expect(robotsContent).toBe("noindex, nofollow");
	}

	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
		await expect(
			page.getByRole("heading", {
				name: "Trang web đang trong quá trình phát triển",
			}),
		).toBeVisible();
		const overflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(overflow, `horizontal overflow at ${vp.name}`).toBe(false);
	}
}

test.describe("profile maintenance mode", () => {
	test("serve.mjs displays plain maintenance notice on all routes and viewports", async ({
		page,
	}) => {
		const port = await getFreePort();
		const config = JSON.parse(readFileSync(maintenanceJsonPath, "utf8")) as {
			disabled?: boolean;
		};
		const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) };
		if (config.disabled) {
			delete env.PROFILE_MAINTENANCE;
		} else {
			env.PROFILE_MAINTENANCE = "true";
		}

		const stderrChunks: string[] = [];
		const child = spawn(process.execPath, [serveEntryPath], {
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderrChunks.push(chunk.toString("utf8"));
		});
		const baseUrl = `http://127.0.0.1:${port}`;

		try {
			await waitForServer(`${baseUrl}/`, child, stderrChunks);
			await assertMaintenanceRendered(page, baseUrl);
		} finally {
			await stopChild(child);
		}
	});
});
