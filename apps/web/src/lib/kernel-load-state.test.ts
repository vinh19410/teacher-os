/**
 * First-load state machine units — classification, settle transitions,
 * stale-attempt guard and the return-URL open-redirect guard.
 * Pure node-env tests; no React rendering.
 */
import { describe, expect, test } from "vitest";
import {
	beginLoad,
	classifyLoadError,
	DEFAULT_RETURN_URL,
	HttpError,
	MalformedSnapshotError,
	settleLoadFailure,
	settleLoadSuccess,
	shouldSettle,
	validateReturnUrl,
} from "./kernel-load-state";

describe("classifyLoadError", () => {
	test("HTTP 401 maps to reauth", () => {
		const failure = classifyLoadError(
			new HttpError(401, "GET /api/kernel failed: 401"),
		);
		expect(failure.kind).toBe("reauth");
		expect(failure.reason).toBe("unauthorized");
	});

	test("HTTP 5xx maps to retryable server failure", () => {
		for (const status of [500, 502, 503, 504]) {
			expect(
				classifyLoadError(new HttpError(status, `boom ${status}`)),
			).toMatchObject({
				kind: "retryable",
				reason: "server",
			});
		}
	});

	test("non-401 4xx (403/404/429) maps to fatal — retry cannot fix it", () => {
		for (const status of [403, 404, 429]) {
			const failure = classifyLoadError(
				new HttpError(status, `boom ${status}`),
			);
			expect(failure.kind).toBe("fatal");
			expect(failure.reason).toBe("http-client-error");
			expect(failure.message).toContain(String(status));
		}
	});

	test("timeout DOMException maps to retryable timeout", () => {
		const error = new DOMException("The operation timed out.", "TimeoutError");
		expect(classifyLoadError(error)).toMatchObject({
			kind: "retryable",
			reason: "timeout",
		});
	});

	test("network TypeError maps to retryable network", () => {
		expect(classifyLoadError(new TypeError("fetch failed"))).toMatchObject({
			kind: "retryable",
			reason: "network",
		});
	});

	test("malformed snapshot (JSON syntax or wrong shape) maps to retryable malformed", () => {
		expect(
			classifyLoadError(new MalformedSnapshotError("wrong shape")),
		).toMatchObject({
			kind: "retryable",
			reason: "malformed",
		});
		expect(
			classifyLoadError(new SyntaxError("Unexpected token < in JSON")),
		).toMatchObject({
			kind: "retryable",
			reason: "malformed",
		});
	});

	test("unclassifiable errors fail open to retryable with a generic message", () => {
		expect(classifyLoadError(new Error("mystery"))).toMatchObject({
			kind: "retryable",
			reason: "unknown",
		});
		expect(classifyLoadError("string error")).toMatchObject({
			kind: "retryable",
			reason: "unknown",
		});
	});

	test("every failure carries a user-facing message", () => {
		const cases = [
			new HttpError(401, "x"),
			new HttpError(403, "x"),
			new HttpError(500, "x"),
			new DOMException("t", "TimeoutError"),
			new TypeError("n"),
			new MalformedSnapshotError("m"),
			new Error("?"),
		];
		for (const error of cases) {
			expect(classifyLoadError(error).message.length).toBeGreaterThan(0);
		}
	});
});

describe("load state transitions", () => {
	test("beginLoad starts loading", () => {
		expect(beginLoad()).toEqual({ status: "loading" });
	});

	test("settleLoadSuccess mounts the app", () => {
		expect(settleLoadSuccess()).toEqual({ status: "ready" });
	});

	test("settleLoadFailure classifies the error into a blocking state", () => {
		const state = settleLoadFailure(new HttpError(403, "no membership"));
		expect(state.status).toBe("error");
		if (state.status === "error") {
			expect(state.failure.kind).toBe("fatal");
		}
	});

	test("a successful retry re-enters loading and settles ready on the new attempt", () => {
		// First attempt failed with a retryable error → blocking screen.
		const failed = settleLoadFailure(new HttpError(503, "down"));
		expect(failed.status).toBe("error");
		// User clicks retry: the new attempt becomes the latest and may settle.
		const retrySeq = 2;
		expect(shouldSettle(retrySeq, retrySeq)).toBe(true);
		// The stale first attempt settling late must be ignored.
		expect(shouldSettle(1, retrySeq)).toBe(false);
		expect(settleLoadSuccess().status).toBe("ready");
	});
});

describe("shouldSettle stale-attempt guard", () => {
	test("only the latest attempt may settle state", () => {
		expect(shouldSettle(1, 1)).toBe(true);
		expect(shouldSettle(1, 2)).toBe(false);
	});

	test("a stale rejection cannot unmount an already-ready workspace", () => {
		// attempt 2 settled ready; attempt 1 rejects afterwards
		const latestSeq = 2;
		const staleAttemptSeq = 1;
		expect(shouldSettle(staleAttemptSeq, latestSeq)).toBe(false);
	});
});

describe("validateReturnUrl", () => {
	test("internal paths survive", () => {
		expect(validateReturnUrl("/students/abc123")).toBe("/students/abc123");
		expect(validateReturnUrl("/dashboard?tab=1")).toBe("/dashboard?tab=1");
		expect(validateReturnUrl(undefined)).toBe(DEFAULT_RETURN_URL);
		expect(validateReturnUrl("")).toBe(DEFAULT_RETURN_URL);
		expect(validateReturnUrl(null)).toBe(DEFAULT_RETURN_URL);
	});

	test("encoded internal paths decode and survive", () => {
		expect(validateReturnUrl(encodeURIComponent("/students/abc123"))).toBe(
			"/students/abc123",
		);
	});

	test("open-redirect payloads are rejected to the dashboard", () => {
		const attacks = [
			"//evil.com",
			"/\\evil.com",
			"https://evil.com",
			"http://evil.com/phish",
			"javascript:alert(1)",
			encodeURIComponent("//evil.com"),
			encodeURIComponent(encodeURIComponent("//evil.com")),
			"/%2F%2Fevil.com",
			"evil.com/path",
			"///evil.com",
		];
		for (const attack of attacks) {
			expect(validateReturnUrl(attack), attack).toBe(DEFAULT_RETURN_URL);
		}
	});

	test("control characters are rejected — the URL parser strips them before parsing", () => {
		// WHATWG URL parsing strips tab/LF/CR first, so a raw-string `//` check
		// alone would let "/\t/evil.com" through and resolve to a foreign
		// origin. The guard must reject the payload outright.
		const attacks = [
			"/\t/evil.com",
			"/\n//evil.com",
			"/\r//evil.com",
			"/\t\\evil.com",
			"/dash\u0000board",
			"/dash\u007Fboard",
			encodeURIComponent("/\t/evil.com"),
		];
		for (const attack of attacks) {
			expect(validateReturnUrl(attack), JSON.stringify(attack)).toBe(
				DEFAULT_RETURN_URL,
			);
		}
		// Plain internal paths with no control characters still survive.
		expect(validateReturnUrl("/students/abc?tab=1#sec")).toBe(
			"/students/abc?tab=1#sec",
		);
	});

	test("malformed percent-encoding falls back safely", () => {
		expect(validateReturnUrl("/students/%E0%A4%A")).toBe(DEFAULT_RETURN_URL);
	});
});
