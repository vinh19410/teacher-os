import { afterEach, describe, expect, it, vi } from "vitest";
import {
	readCollapsedPref,
	SIDEBAR_COLLAPSED_KEY,
	writeCollapsedPref,
} from "./sidebar-prefs";

function stubStorage(impl: Pick<Storage, "getItem" | "setItem">) {
	vi.stubGlobal("window", { localStorage: impl });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("readCollapsedPref", () => {
	it('returns true when key is "true"', () => {
		stubStorage({
			getItem: (k) => (k === SIDEBAR_COLLAPSED_KEY ? "true" : null),
			setItem: () => {},
		});
		expect(readCollapsedPref()).toBe(true);
	});

	it('returns false when key is "false"', () => {
		stubStorage({
			getItem: (k) => (k === SIDEBAR_COLLAPSED_KEY ? "false" : null),
			setItem: () => {},
		});
		expect(readCollapsedPref()).toBe(false);
	});

	it("returns false when key is missing", () => {
		stubStorage({ getItem: () => null, setItem: () => {} });
		expect(readCollapsedPref()).toBe(false);
	});

	it("returns false when localStorage throws (private mode)", () => {
		stubStorage({
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {},
		});
		expect(readCollapsedPref()).toBe(false);
	});
});

describe("writeCollapsedPref", () => {
	it("writes the boolean as string", () => {
		const setItem = vi.fn();
		stubStorage({ getItem: () => null, setItem });
		writeCollapsedPref(true);
		writeCollapsedPref(false);
		expect(setItem).toHaveBeenNthCalledWith(1, SIDEBAR_COLLAPSED_KEY, "true");
		expect(setItem).toHaveBeenNthCalledWith(2, SIDEBAR_COLLAPSED_KEY, "false");
	});

	it("swallows storage errors instead of crashing", () => {
		stubStorage({
			getItem: () => null,
			setItem: () => {
				throw new Error("quota");
			},
		});
		expect(() => writeCollapsedPref(true)).not.toThrow();
	});
});
