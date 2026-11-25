/**
 * reauth single-flight, bounded signOut ordering, and bfcache cancellation —
 * real module, mocked auth-client transport only.
 */
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const clearSessionCacheMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: signOutMock,
		clearSessionCache: clearSessionCacheMock,
	},
}));

import { reauth, resetReauthForTests } from "@/lib/reauth";

beforeEach(() => {
	signOutMock.mockReset().mockResolvedValue(undefined);
	clearSessionCacheMock.mockReset();
	resetReauthForTests();
});

afterEach(() => {
	resetReauthForTests();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

test("reauth() is single-flight, calls signOut synchronously, and waits before assigning /teacher returnUrl", async () => {
	let resolveSignOut!: () => void;
	signOutMock.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				resolveSignOut = resolve;
			}),
	);

	const assign = vi.fn();
	vi.stubGlobal("window", {
		location: {
			assign,
			pathname: "/teacher/grading",
			search: "?tab=pending",
			hash: "#top",
		},
	});

	reauth();
	reauth();

	expect(clearSessionCacheMock).toHaveBeenCalledTimes(1);
	expect(signOutMock).toHaveBeenCalledTimes(1);
	expect(assign).not.toHaveBeenCalled();

	resolveSignOut();
	await vi.waitFor(() => {
		expect(assign).toHaveBeenCalledTimes(1);
	});
	expect(assign).toHaveBeenCalledWith(
		"/login?returnUrl=%2Fteacher%2Fgrading%3Ftab%3Dpending%23top",
	);
});

test("reauth() redirects after 2000ms timeout when signOut hangs", async () => {
	vi.useFakeTimers();
	signOutMock.mockImplementationOnce(() => new Promise(() => {}));

	const assign = vi.fn();
	vi.stubGlobal("window", {
		location: {
			assign,
			pathname: "/teacher/classes",
			search: "",
			hash: "",
		},
	});

	reauth();
	expect(signOutMock).toHaveBeenCalledTimes(1);

	await vi.advanceTimersByTimeAsync(1_999);
	expect(assign).not.toHaveBeenCalled();

	await vi.advanceTimersByTimeAsync(1);
	expect(assign).toHaveBeenCalledTimes(1);
	expect(assign).toHaveBeenCalledWith("/login?returnUrl=%2Fteacher%2Fclasses");
});

test("reauth() still redirects when signOut rejects", async () => {
	signOutMock.mockRejectedValueOnce(new Error("network error"));

	const assign = vi.fn();
	vi.stubGlobal("window", {
		location: {
			assign,
			pathname: "/teacher/classes",
			search: "",
			hash: "",
		},
	});

	reauth();
	expect(signOutMock).toHaveBeenCalledTimes(1);

	await vi.waitFor(() => {
		expect(assign).toHaveBeenCalledTimes(1);
	});
	expect(assign).toHaveBeenCalledWith("/login?returnUrl=%2Fteacher%2Fclasses");
});

test("reauth() cancels pending continuation when reset/pageshow fires before signOut settles", async () => {
	let resolveSignOut!: () => void;
	signOutMock.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				resolveSignOut = resolve;
			}),
	);

	const assign = vi.fn();
	vi.stubGlobal("window", {
		location: {
			assign,
			pathname: "/teacher/classes",
			search: "",
			hash: "",
		},
	});

	reauth();
	expect(signOutMock).toHaveBeenCalledTimes(1);
	expect(assign).not.toHaveBeenCalled();

	resetReauthForTests();
	resolveSignOut();
	await Promise.resolve();
	await Promise.resolve();
	expect(assign).not.toHaveBeenCalled();
});

test("reauth() cancels pending continuation on persisted pageshow and pagehide events", async () => {
	const listeners = new Map<
		string,
		Array<(event: { persisted?: boolean }) => void>
	>();
	const assign = vi.fn();
	vi.stubGlobal("window", {
		location: {
			assign,
			pathname: "/teacher/classes",
			search: "",
			hash: "",
		},
		addEventListener: (
			type: string,
			handler: (event: { persisted?: boolean }) => void,
		) => {
			const list = listeners.get(type) ?? [];
			list.push(handler);
			listeners.set(type, list);
		},
	});

	vi.resetModules();
	const fresh = await import("@/lib/reauth");

	let resolveA!: () => void;
	signOutMock.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				resolveA = resolve;
			}),
	);
	fresh.reauth();
	for (const fn of listeners.get("pageshow") ?? []) fn({ persisted: true });
	resolveA();
	await Promise.resolve();
	await Promise.resolve();
	expect(assign).not.toHaveBeenCalled();

	let resolveB!: () => void;
	signOutMock.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				resolveB = resolve;
			}),
	);
	fresh.reauth();
	for (const fn of listeners.get("pagehide") ?? []) fn({});
	resolveB();
	await Promise.resolve();
	await Promise.resolve();
	expect(assign).not.toHaveBeenCalled();
});
