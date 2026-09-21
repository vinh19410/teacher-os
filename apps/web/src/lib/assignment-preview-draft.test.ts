import { afterEach, describe, expect, test, vi } from "vitest";

import {
	PREVIEW_DRAFT_KEY,
	readPreviewDraft,
	savePreviewDraft,
	takePreviewDraft,
} from "./assignment-preview-draft";

const valid = {
	task: "task2",
	genre: "discuss",
	title: "QC Preview Essay",
	band: "7.0",
	source: "Cambridge 10, Test 2",
	prompt: "Some people think…",
	note: "",
	status: "ready",
} as const;

function fakeStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
	};
}

function stubWindowWithSessionStorage() {
	vi.stubGlobal("window", { sessionStorage: fakeStorage() });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("assignment-preview-draft (#213)", () => {
	test("save → read returns all eight fields", () => {
		stubWindowWithSessionStorage();
		savePreviewDraft(valid);
		expect(readPreviewDraft()).toEqual(valid);
	});

	test("read does not clear — calling twice still returns the draft", () => {
		stubWindowWithSessionStorage();
		savePreviewDraft(valid);
		expect(readPreviewDraft()).toEqual(valid);
		expect(readPreviewDraft()).toEqual(valid);
	});

	test("take clears: the next take/read returns null", () => {
		stubWindowWithSessionStorage();
		savePreviewDraft(valid);
		expect(takePreviewDraft()).toEqual(valid);
		expect(takePreviewDraft()).toBeNull();
		expect(readPreviewDraft()).toBeNull();
	});

	test("malformed JSON returns null and take cleans the junk key", () => {
		stubWindowWithSessionStorage();
		window.sessionStorage.setItem(PREVIEW_DRAFT_KEY, "{oops");
		expect(readPreviewDraft()).toBeNull();
		expect(takePreviewDraft()).toBeNull();
		expect(window.sessionStorage.getItem(PREVIEW_DRAFT_KEY)).toBeNull();
	});

	test("wrong shape (missing/typed/enum fields) returns null", () => {
		stubWindowWithSessionStorage();
		for (const bad of [
			{ ...valid, title: undefined },
			{ ...valid, band: 7 },
			{ ...valid, status: "ready!!" },
			{ task: "task2" },
		]) {
			window.sessionStorage.setItem(PREVIEW_DRAFT_KEY, JSON.stringify(bad));
			expect(readPreviewDraft(), JSON.stringify(bad).slice(0, 40)).toBeNull();
		}
	});

	test("without a window stub every call is safe and reads as null", () => {
		savePreviewDraft(valid);
		expect(readPreviewDraft()).toBeNull();
		expect(takePreviewDraft()).toBeNull();
	});
});
