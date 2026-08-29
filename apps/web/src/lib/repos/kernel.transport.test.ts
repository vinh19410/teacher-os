/**
 * Transport envelope + reason parsing for occurrence actions (#98 N2 / K7).
 * Roundtrip honesty: the 2xx body fields must survive to dispatch payload,
 * and error `{reason}` must ride on HttpError without garbage bodies crashing.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import type { KernelAction } from "@/lib/data-actions";
import { HttpError } from "@/lib/kernel-load-state";
import { createKernelCommandBus, postKernelCommand } from "./kernel";

const BASE = "http://test.local";

function stubFetchOnce(
	status: number,
	body: string,
	contentType = "application/json",
) {
	const realFetch = globalThis.fetch;
	vi.stubGlobal("fetch", () =>
		Promise.resolve(
			new Response(body, { status, headers: { "content-type": contentType } }),
		),
	);
	return () => {
		vi.unstubAllGlobals();
		globalThis.fetch = realFetch;
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("postKernelCommand 2xx envelope (N2)", () => {
	test("occurrence response {updated, skipped} parses into envelope", async () => {
		const restore = stubFetchOnce(
			200,
			JSON.stringify({ updated: 3, skipped: 1 }),
		);
		const env = await postKernelCommand(BASE, {
			type: "check-in",
			lessonId: "l1",
		} as KernelAction);
		restore();
		expect(env).toEqual({ updated: 3, skipped: 1 });
	});

	test("legacy {id} response keeps working and payload fields stay undefined", async () => {
		const restore = stubFetchOnce(200, JSON.stringify({ id: "abc" }));
		const env = await postKernelCommand(BASE, {
			type: "check-in",
			lessonId: "l",
		} as KernelAction);
		restore();
		expect(env).toEqual({ id: "abc" });
	});

	test("garbage/HTML 2xx body degrades to empty envelope instead of crashing", async () => {
		const restore = stubFetchOnce(
			200,
			"<html>proxy hiccup</html>",
			"text/html",
		);
		const env = await postKernelCommand(BASE, {
			type: "check-in",
			lessonId: "l",
		} as KernelAction);
		restore();
		expect(env).toEqual({});
	});
});

describe("HttpError.reason transport (K7)", () => {
	test("409 with JSON {reason} attaches reason", async () => {
		stubFetchOnce(409, JSON.stringify({ reason: "date-occupied" }));
		await expect(
			postKernelCommand(BASE, {
				type: "check-in",
				lessonId: "l",
			} as KernelAction),
		).rejects.toMatchObject({ status: 409, reason: "date-occupied" });
	});

	test("body-rác (plain text / weird JSON) silently leaves reason undefined", async () => {
		stubFetchOnce(400, "oops");
		await expect(
			postKernelCommand(BASE, {
				type: "check-in",
				lessonId: "l",
			} as KernelAction),
		).rejects.toMatchObject({
			status: 400,
			reason: undefined,
		});
	});
});

describe("bus threads payload through refreshed/committed", () => {
	function busHarness(
		postImpl: () => Promise<unknown>,
		refetchImpl: () => Promise<void>,
	) {
		return createKernelCommandBus({
			postCommand: postImpl as never,
			refetch: refetchImpl,
			onAuthLost: () => {},
		});
	}

	test("refreshed result carries updated/skipped", async () => {
		const bus = busHarness(
			async () => ({ id: undefined, updated: 2, skipped: 1 }),
			async () => {},
		);
		const result = await bus.run({
			type: "check-in",
			lessonId: "l",
		} as KernelAction);
		expect(result).toMatchObject({ kind: "refreshed", updated: 2, skipped: 1 });
	});

	test("definite-failure carries machine reason for outcome messaging (N5)", async () => {
		const bus = busHarness(
			async () => {
				throw new HttpError(409, "conflict", {
					reason: "use-occurrence-endpoint",
				});
			},
			async () => {},
		);
		const result = await bus.run({
			type: "lesson-edit",
			lessonId: "l",
			payload: {},
		} as unknown as KernelAction);
		expect(result.kind === "definite-failure" && result.reason).toBe(
			"use-occurrence-endpoint",
		);
	});
});
