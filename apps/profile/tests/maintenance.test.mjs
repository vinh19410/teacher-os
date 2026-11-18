import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { buildProfile } from "../build.mjs";
import {
	isProfileMaintenanceEnabled,
	MAINTENANCE_HEADERS_FILE,
	renderMaintenanceHtml,
} from "../maintenance.mjs";
import { createProfileServer } from "../serve.mjs";

const maintenanceJsonUrl = new URL("../maintenance.json", import.meta.url);

async function withMaintenanceEnv(value, fn) {
	const hadKey = Object.hasOwn(process.env, "PROFILE_MAINTENANCE");
	const previous = process.env.PROFILE_MAINTENANCE;
	if (value === undefined) {
		delete process.env.PROFILE_MAINTENANCE;
	} else {
		process.env.PROFILE_MAINTENANCE = value;
	}
	try {
		return await fn();
	} finally {
		if (hadKey) {
			process.env.PROFILE_MAINTENANCE = previous;
		} else {
			delete process.env.PROFILE_MAINTENANCE;
		}
	}
}

test("maintenance.json toggles default mode and isProfileMaintenanceEnabled fails closed on invalid overrides", async () => {
	const config = JSON.parse(readFileSync(maintenanceJsonUrl, "utf8"));
	assert.equal(typeof config.disabled, "boolean");

	await withMaintenanceEnv(undefined, () => {
		assert.equal(isProfileMaintenanceEnabled(), config.disabled);
		assert.equal(isProfileMaintenanceEnabled(""), config.disabled);
		assert.equal(isProfileMaintenanceEnabled("false"), false);
		assert.equal(isProfileMaintenanceEnabled("0"), false);
		assert.equal(isProfileMaintenanceEnabled(" FALSE "), false);
		assert.equal(isProfileMaintenanceEnabled("true"), true);
		assert.equal(isProfileMaintenanceEnabled("1"), true);
		assert.throws(
			() => isProfileMaintenanceEnabled("yes"),
			/Invalid PROFILE_MAINTENANCE/,
		);
	});
});

test("renderMaintenanceHtml outputs standalone noindex notice without links, buttons, or forms", () => {
	const html = renderMaintenanceHtml();
	assert.match(html, /<html lang="vi">/);
	assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
	assert.match(html, /Trang web đang trong quá trình phát triển/);
	assert.equal(/<a[\s>]/i.test(html), false);
	assert.equal(/<button[\s>]/i.test(html), false);
	assert.equal(/<form[\s>]/i.test(html), false);
	assert.equal(/<script[\s>]/i.test(html), false);
	assert.equal(/lead-api/i.test(html), false);
	assert.equal(/kiem-tra-dau-vao/i.test(html), false);
	assert.equal(/studentPortalLink/i.test(html), false);
});

test("createProfileServer serves maintenance HTML on all GET/HEAD routes and rejects other methods with 405", async () => {
	await withMaintenanceEnv("true", async () => {
		const server = createProfileServer(
			"http://localhost:8100",
			"http://localhost:8103",
		);
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address();
		const base = `http://127.0.0.1:${port}`;
		const expectedHtml = renderMaintenanceHtml();
		const expectedBytes = Buffer.byteLength(expectedHtml, "utf8");

		try {
			for (const reqPath of [
				"/",
				"/kiem-tra-dau-vao",
				"/kiem-tra-dau-vao/",
				"/kiem-tra-dau-vao/ket-qua/?t=abc123",
				"/noi-bo/",
				"/duong-dan-bat-ky",
			]) {
				const res = await fetch(`${base}${reqPath}`, { redirect: "manual" });
				assert.equal(res.status, 200, `GET ${reqPath} must return 200`);
				assert.equal(
					res.headers.get("content-type"),
					"text/html; charset=utf-8",
				);
				assert.equal(
					res.headers.get("cache-control"),
					"no-cache, no-store, must-revalidate",
				);
				assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
				assert.equal(res.headers.get("x-content-type-options"), "nosniff");
				assert.equal(Number(res.headers.get("content-length")), expectedBytes);
				const body = await res.text();
				assert.equal(body, expectedHtml);
			}

			const headRes = await fetch(`${base}/`, { method: "HEAD" });
			assert.equal(headRes.status, 200);
			assert.equal(
				Number(headRes.headers.get("content-length")),
				expectedBytes,
			);
			assert.equal(await headRes.text(), "");

			for (const [method, reqPath] of [
				["POST", "/noi-bo/"],
				["PUT", "/index.html"],
				["DELETE", "/"],
			]) {
				const res = await fetch(`${base}${reqPath}`, { method });
				assert.equal(res.status, 405, `${method} ${reqPath} must return 405`);
				assert.equal(res.headers.get("allow"), "GET, HEAD");
				const text = await res.text();
				assert.equal(text.includes("Kịch bản tư vấn"), false);
			}

			const nullByteRes = await fetch(`${base}/%00`);
			assert.equal(nullByteRes.status, 400);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
});

test("buildProfile writes only maintenance HTML and _headers when disabled and omits public assets", async () => {
	await withMaintenanceEnv("true", async () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), "profile-maintenance-build-"));
		try {
			const distDir = join(tmpRoot, "dist");
			await buildProfile({ distUrl: pathToFileURL(distDir) });
			const expectedHtml = renderMaintenanceHtml();

			for (const relPath of [
				"index.html",
				join("kiem-tra-dau-vao", "index.html"),
				join("kiem-tra-dau-vao", "ket-qua", "index.html"),
				join("noi-bo", "index.html"),
			]) {
				const target = join(distDir, relPath);
				assert.equal(existsSync(target), true, `missing ${relPath}`);
				assert.equal(readFileSync(target, "utf8"), expectedHtml);
			}

			const headersPath = join(distDir, "_headers");
			assert.equal(existsSync(headersPath), true, "missing _headers");
			assert.equal(readFileSync(headersPath, "utf8"), MAINTENANCE_HEADERS_FILE);

			for (const omitted of [
				"assets",
				"huong-dan-kiem-tra-dau-vao.mp4",
				join("kiem-tra-dau-vao", "test.js"),
				join("kiem-tra-dau-vao", "lead-gate.js"),
			]) {
				assert.equal(
					existsSync(join(distDir, omitted)),
					false,
					`${omitted} must not be published during maintenance`,
				);
			}
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true });
		}
	});
});

test("PROFILE_MAINTENANCE=false env override restores normal profile serving and build", async () => {
	await withMaintenanceEnv("false", async () => {
		const server = createProfileServer(
			"http://localhost:8100",
			"http://localhost:8103",
		);
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address();
		try {
			const res = await fetch(`http://127.0.0.1:${port}/`);
			assert.equal(res.status, 200);
			const body = await res.text();
			assert.match(body, /Cô Mỹ Dạy Tiếng Anh/);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}

		const tmpRoot = mkdtempSync(join(tmpdir(), "profile-maintenance-off-"));
		try {
			const distDir = join(tmpRoot, "dist");
			await buildProfile({
				distUrl: pathToFileURL(distDir),
				leadApiUrl: "https://api.example.test",
				studentPortalUrl: "https://student.example.test",
			});
			assert.equal(existsSync(join(distDir, "_headers")), false);
			assert.match(
				readFileSync(join(distDir, "index.html"), "utf8"),
				/Cô Mỹ Dạy Tiếng Anh/,
			);
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true });
		}
	});
});
