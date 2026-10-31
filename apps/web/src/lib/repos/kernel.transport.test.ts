/**
 * Transport envelope + reason parsing for occurrence actions (#98 N2 / K7).
 * Roundtrip honesty: the 2xx body fields must survive to dispatch payload,
 * and error `{reason}` must ride on HttpError without garbage bodies crashing.
 */

import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { KernelAction } from "@/lib/data-actions";
import { HttpError } from "@/lib/kernel-load-state";
import {
	createKernelCommandBus,
	fetchKernelSnapshot,
	isStudentRoleRejected,
	postKernelCommand,
} from "./kernel";

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

	test("422 future-session body (error + reason both machine codes) attaches the code", async () => {
		stubFetchOnce(
			422,
			JSON.stringify({ error: "future-session", reason: "future-session" }),
		);
		await expect(
			postKernelCommand(BASE, {
				type: "check-in",
				lessonId: "l",
			} as KernelAction),
		).rejects.toMatchObject({ status: 422, reason: "future-session" });
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

describe("GET snapshot transport role reason (plan #260)", () => {
	test("403 body {error: ACCOUNT_STUDENT_ROLE} rides on HttpError.reason", async () => {
		stubFetchOnce(
			403,
			JSON.stringify({ error: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP }),
		);
		await expect(fetchKernelSnapshot(BASE)).rejects.toMatchObject({
			status: 403,
			reason: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP,
		});
	});

	test("403 body {error: ACCOUNT_TEACHER_NOT_ALLOWED} rides on HttpError.reason and isStudentRoleRejected returns true (#513)", async () => {
		stubFetchOnce(
			403,
			JSON.stringify({ error: ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED }),
		);
		let caught: unknown;
		try {
			await fetchKernelSnapshot(BASE);
		} catch (err) {
			caught = err;
		}
		expect(caught).toMatchObject({
			status: 403,
			reason: ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED,
		});
		expect(isStudentRoleRejected(caught)).toBe(true);
	});

	test("403 body {reason: ...} (legacy shape) still parses", async () => {
		stubFetchOnce(403, JSON.stringify({ reason: "some-legacy-reason" }));
		await expect(fetchKernelSnapshot(BASE)).rejects.toMatchObject({
			status: 403,
			reason: "some-legacy-reason",
		});
	});

	test("non-role 403 keeps its own reason — never misread as role-blocked", async () => {
		stubFetchOnce(
			403,
			JSON.stringify({ error: "no membership after bootstrap" }),
		);
		await expect(fetchKernelSnapshot(BASE)).rejects.toMatchObject({
			status: 403,
			reason: "no membership after bootstrap",
		});
	});

	test("garbage 403 body leaves reason undefined, message stays descriptive", async () => {
		stubFetchOnce(403, "<html>proxy</html>", "text/html");
		await expect(fetchKernelSnapshot(BASE)).rejects.toMatchObject({
			status: 403,
			message: "GET /api/kernel failed: 403",
			reason: undefined,
		});
	});
});

describe("bus onRoleBlocked seam (plan #260)", () => {
	test("write 403 ACCOUNT_STUDENT_ROLE fires onRoleBlocked as definite-failure", async () => {
		const blockedCalls: number[] = [];
		const authLostCalls: number[] = [];
		const bus = createKernelCommandBus({
			postCommand: (() =>
				Promise.reject(
					new HttpError(403, ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP, {
						reason: ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP,
					}),
				)) as never,
			refetch: async () => {},
			onAuthLost: () => {
				authLostCalls.push(1);
			},
			onRoleBlocked: () => {
				blockedCalls.push(1);
			},
		});
		const result = await bus.run({
			type: "check-in",
			lessonId: "l",
		} as KernelAction);
		expect(result.kind).toBe("definite-failure");
		expect(blockedCalls).toHaveLength(1);
		expect(authLostCalls).toHaveLength(0);
	});

	test("write 403 ACCOUNT_TEACHER_NOT_ALLOWED fires onRoleBlocked as definite-failure (#513)", async () => {
		const blockedCalls: number[] = [];
		const authLostCalls: number[] = [];
		const bus = createKernelCommandBus({
			postCommand: (() =>
				Promise.reject(
					new HttpError(403, ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED, {
						reason: ACCOUNT_ERROR_CODES.TEACHER_NOT_ALLOWED,
					}),
				)) as never,
			refetch: async () => {},
			onAuthLost: () => {
				authLostCalls.push(1);
			},
			onRoleBlocked: () => {
				blockedCalls.push(1);
			},
		});
		const result = await bus.run({
			type: "check-in",
			lessonId: "l",
		} as KernelAction);
		expect(result.kind).toBe("definite-failure");
		expect(blockedCalls).toHaveLength(1);
		expect(authLostCalls).toHaveLength(0);
	});

	test("other 403s never fire onRoleBlocked", async () => {
		const blockedCalls: number[] = [];
		const bus = createKernelCommandBus({
			postCommand: (() =>
				Promise.reject(
					new HttpError(403, "forbidden", { reason: "not-allowed" }),
				)) as never,
			refetch: async () => {},
			onAuthLost: () => {},
			onRoleBlocked: () => {
				blockedCalls.push(1);
			},
		});
		await bus.run({ type: "check-in", lessonId: "l" } as KernelAction);
		expect(blockedCalls).toHaveLength(0);
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
