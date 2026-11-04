import { afterEach, describe, expect, test, vi } from "vitest";
import { emptyItem } from "@/components/assignments/assignment-presets";
import type { ComposerValue } from "@/components/assignments/prompt-composer";
import {
	ASSIGNMENT_DRAFT_KEY,
	ASSIGNMENT_DRAFT_MAX_LENGTH,
	ASSIGNMENT_DRAFT_SCHEMA_VERSION,
	ASSIGNMENT_DRAFT_TTL_MS,
	clearAssignmentDraft,
	composerDraftHasContent,
	readAssignmentDraft,
	type StoredAssignmentDraft,
	saveAssignmentDraft,
} from "./assignment-draft-store";

function fakeStorage() {
	const map = new Map<string, string>();
	let failWrites = false;
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => {
			if (failWrites) throw new Error("QuotaExceededError");
			void map.set(k, v);
		},
		removeItem: (k: string) => void map.delete(k),
		get size() {
			return map.size;
		},
		failNextWrites() {
			failWrites = true;
		},
	};
}

function composerValue(overrides: Partial<ComposerValue> = {}): ComposerValue {
	return {
		skill: "reading",
		part: "p1",
		type: "tfng",
		title: "QC-218 Reading TFNG",
		band: "7.0",
		source: "",
		prompt: "",
		passage: "Stepwells are underground reservoirs…",
		intro: "Questions 1–2",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		optionBank: [],
		note: "",
		items: [
			{ stem: "First", answer: "TRUE", opts: null, alts: "" },
			{ stem: "", answer: "", opts: null, alts: "" },
		],
		...overrides,
	};
}

function draft(
	overrides: Partial<StoredAssignmentDraft> = {},
): StoredAssignmentDraft {
	return {
		schemaVersion: ASSIGNMENT_DRAFT_SCHEMA_VERSION,
		savedAt: Date.now(),
		status: "ready",
		value: composerValue(),
		...overrides,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("assignment draft store — localStorage autosave (FR6)", () => {
	test("save → read returns the full composer value and status (non-destructive)", () => {
		const store = fakeStorage();
		saveAssignmentDraft(draft(), store);
		const first = readAssignmentDraft(store);
		expect(first?.value).toEqual(composerValue());
		expect(first?.status).toBe("ready");
		// Non-destructive: a second read still sees the stored draft.
		expect(readAssignmentDraft(store)).toEqual(first);
	});

	test("round-trip keeps items, transcript and every composer field", () => {
		const store = fakeStorage();
		const value = composerValue({
			skill: "listening",
			part: "s1",
			type: "form",
			transcript: "W: Good morning…",
			items: [
				{ stem: "Name:", answer: "Clarke", opts: null, alts: "Clarke-T" },
			],
		});
		saveAssignmentDraft({ ...draft(), value, status: "draft" }, store);
		const read = readAssignmentDraft(store);
		expect(read?.value).toEqual(value);
		expect(read?.status).toBe("draft");
	});

	test("clear removes the stored draft", () => {
		const store = fakeStorage();
		saveAssignmentDraft(draft(), store);
		clearAssignmentDraft(store);
		expect(readAssignmentDraft(store)).toBeNull();
		expect(store.size).toBe(0);
	});

	test("expired draft (older than TTL) is ignored and dropped", () => {
		const store = fakeStorage();
		saveAssignmentDraft(
			draft({ savedAt: Date.now() - ASSIGNMENT_DRAFT_TTL_MS - 1 }),
			store,
		);
		expect(readAssignmentDraft(store)).toBeNull();
		expect(store.size).toBe(0);
	});

	test("fresh draft (younger than TTL) is returned", () => {
		const store = fakeStorage();
		saveAssignmentDraft(
			draft({ savedAt: Date.now() - ASSIGNMENT_DRAFT_TTL_MS + 60_000 }),
			store,
		);
		expect(readAssignmentDraft(store)).not.toBeNull();
	});

	test("draft with a foreign schemaVersion is ignored and dropped", () => {
		const store = fakeStorage();
		store.setItem(
			ASSIGNMENT_DRAFT_KEY,
			JSON.stringify({ ...draft(), schemaVersion: 999 }),
		);
		expect(readAssignmentDraft(store)).toBeNull();
		expect(store.size).toBe(0);
	});

	test("malformed JSON is ignored and cleaned up", () => {
		const store = fakeStorage();
		store.setItem(ASSIGNMENT_DRAFT_KEY, "{oops");
		expect(readAssignmentDraft(store)).toBeNull();
		expect(store.size).toBe(0);
	});

	test("wrong shape (missing composer fields, bad status, bad savedAt) is ignored", () => {
		const store = fakeStorage();
		const bads = [
			{ ...draft(), status: "published" },
			{ ...draft(), savedAt: "yesterday" },
			{ ...draft(), value: { ...composerValue(), items: "many" } },
			{ ...draft(), value: { ...composerValue(), title: 42 } },
			{ schemaVersion: 1 },
		];
		for (const bad of bads) {
			store.setItem(ASSIGNMENT_DRAFT_KEY, JSON.stringify(bad));
			expect(
				readAssignmentDraft(store),
				JSON.stringify(bad).slice(0, 60),
			).toBeNull();
		}
	});

	test("corrupted question pin (non-object / out-of-range) is ignored (phase-04)", () => {
		const store = fakeStorage();
		const bads = [
			{
				...draft(),
				value: {
					...composerValue(),
					items: [
						{
							stem: "S",
							answer: "TRUE",
							opts: null,
							alts: "",
							pin: "top-left",
						},
					],
				},
			},
			{
				...draft(),
				value: {
					...composerValue(),
					items: [
						{
							stem: "S",
							answer: "TRUE",
							opts: null,
							alts: "",
							pin: { x: 200, y: 10 },
						},
					],
				},
			},
		];
		for (const bad of bads) {
			store.setItem(ASSIGNMENT_DRAFT_KEY, JSON.stringify(bad));
			expect(readAssignmentDraft(store)).toBeNull();
			expect(store.size).toBe(0);
		}
		// A valid pin (and pin: null) stays valid.
		const withPins = draft({
			value: composerValue({
				items: [
					{
						stem: "S",
						answer: "TRUE",
						opts: null,
						alts: "",
						pin: { x: 10, y: 90 },
					},
					{ stem: "S2", answer: "", opts: null, alts: "", pin: null },
				],
			}),
		});
		store.setItem(ASSIGNMENT_DRAFT_KEY, JSON.stringify(withPins));
		expect(readAssignmentDraft(store)).not.toBeNull();
	});

	test("corrupted question opts (non-array) is ignored — must not crash the grid", () => {
		const store = fakeStorage();
		const bads = [
			{
				...draft(),
				value: {
					...composerValue(),
					items: [{ stem: "S", answer: "TRUE", opts: "garbage", alts: "" }],
				},
			},
			{
				...draft(),
				value: {
					...composerValue(),
					items: [{ stem: "S", answer: "TRUE", opts: [42], alts: "" }],
				},
			},
		];
		for (const bad of bads) {
			store.setItem(ASSIGNMENT_DRAFT_KEY, JSON.stringify(bad));
			expect(readAssignmentDraft(store)).toBeNull();
			expect(store.size).toBe(0);
		}
		// null opts stays valid (the QuestionItem default).
		const withNullOpts = draft({
			value: composerValue({
				items: [{ stem: "S", answer: "TRUE", opts: null, alts: "" }],
			}),
		});
		store.setItem(ASSIGNMENT_DRAFT_KEY, JSON.stringify(withNullOpts));
		expect(readAssignmentDraft(store)).not.toBeNull();
	});

	test("oversized payload is not written and warns (512KB HTML cap)", () => {
		const store = fakeStorage();
		const bloated = composerValue({
			passage: "x".repeat(ASSIGNMENT_DRAFT_MAX_LENGTH),
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			saveAssignmentDraft(draft({ value: bloated }), store);
			expect(store.size).toBe(0);
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			warn.mockRestore();
		}
	});

	test("QuotaExceeded while saving never throws", () => {
		const store = fakeStorage();
		store.failNextWrites();
		expect(() => saveAssignmentDraft(draft(), store)).not.toThrow();
	});

	test("without a window (SSR/node) every call is safe and reads as null", () => {
		expect(() => saveAssignmentDraft(draft())).not.toThrow();
		expect(readAssignmentDraft()).toBeNull();
		expect(() => clearAssignmentDraft()).not.toThrow();
	});

	test("round-trips valid string explanation and rejects null or non-string explanation (#571)", () => {
		const store = fakeStorage();
		saveAssignmentDraft(
			draft({
				value: composerValue({
					items: [
						{
							stem: "First",
							answer: "TRUE",
							opts: null,
							alts: "",
							explanation: "<p>Vì vậy</p>",
						},
					],
				}),
			}),
			store,
		);
		expect(readAssignmentDraft(store)?.value.items[0]?.explanation).toBe(
			"<p>Vì vậy</p>",
		);

		for (const badExplanation of [123, null]) {
			const corrupt = draft();
			(
				corrupt.value.items[0] as unknown as Record<string, unknown>
			).explanation = badExplanation;
			store.setItem(ASSIGNMENT_DRAFT_KEY, JSON.stringify(corrupt));
			expect(readAssignmentDraft(store)).toBeNull();
		}
	});
});

describe("composerDraftHasContent — autosave skip gate (FR6)", () => {
	test("a fresh composer has no content and must not be autosaved", () => {
		const blank = composerValue({
			title: "",
			passage: "",
			intro: "",
			items: [emptyItem("tfng")],
		});
		expect(composerDraftHasContent(blank)).toBe(false);
	});

	test("any authored field or answered item marks the draft worth saving", () => {
		expect(composerDraftHasContent(composerValue({ title: "Đề 1" }))).toBe(
			true,
		);
		expect(composerDraftHasContent(composerValue({ transcript: "W:…" }))).toBe(
			true,
		);
		expect(
			composerDraftHasContent(
				composerValue({
					items: [{ stem: "s", answer: "TRUE", opts: null, alts: "" }],
				}),
			),
		).toBe(true);
	});

	test("rich text: tag-only fields (<p></p>) do NOT trigger autosave", () => {
		const tagOnly = composerValue({
			title: "",
			prompt: "<p></p>",
			passage: "<p><br></p>",
			intro: "<p> </p>",
			transcript: "<p></p>",
			note: "<p></p>",
			items: [emptyItem("tfng")],
		});
		expect(composerDraftHasContent(tagOnly)).toBe(false);
		expect(
			composerDraftHasContent(
				composerValue({
					title: "",
					passage: "<p><br></p>",
					intro: "<p> </p>",
					items: [emptyItem("tfng")],
					prompt: "<p>x</p>",
				}),
			),
		).toBe(true);
	});

	test("explanation-only item triggers autosave unless empty markup (#571)", () => {
		expect(
			composerDraftHasContent(
				composerValue({
					title: "",
					passage: "",
					intro: "",
					items: [
						{
							...emptyItem("tfng"),
							explanation: "<p>Giải thích nháp</p>",
						},
					],
				}),
			),
		).toBe(true);
		expect(
			composerDraftHasContent(
				composerValue({
					title: "",
					passage: "",
					intro: "",
					items: [
						{
							...emptyItem("tfng"),
							explanation: "<p><br></p>",
						},
					],
				}),
			),
		).toBe(false);
	});
});
