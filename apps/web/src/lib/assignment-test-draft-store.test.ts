import { afterEach, describe, expect, test, vi } from "vitest";
import type { ComposerValue } from "@/components/assignments/prompt-composer";
import {
	ASSIGNMENT_TEST_DRAFT_KEY,
	ASSIGNMENT_TEST_DRAFT_MAX_LENGTH,
	ASSIGNMENT_TEST_DRAFT_SCHEMA_VERSION,
	ASSIGNMENT_TEST_DRAFT_TTL_MS,
	clearAssignmentTestDraft,
	readAssignmentTestDraft,
	type StoredAssignmentTestDraft,
	saveAssignmentTestDraft,
	testDraftHasContent,
} from "./assignment-test-draft-store";

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
		get raw() {
			return map.get(ASSIGNMENT_TEST_DRAFT_KEY) ?? null;
		},
		failNextWrites() {
			failWrites = true;
		},
	};
}

function composerValue(overrides: Partial<ComposerValue> = {}): ComposerValue {
	return {
		skill: "reading",
		part: "p2",
		type: "headings",
		title: "Passage 2 headings",
		band: "7.0",
		source: "Cambridge 18",
		prompt: "",
		passage: "The economy of ancient Rome…",
		intro: "Questions 14–20",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		optionBank: [],
		note: "",
		items: [{ stem: "Heading of para A", answer: "iv", opts: null, alts: "" }],
		...overrides,
	};
}

function testDraft(
	overrides: Partial<StoredAssignmentTestDraft> = {},
): StoredAssignmentTestDraft {
	return {
		schemaVersion: ASSIGNMENT_TEST_DRAFT_SCHEMA_VERSION,
		savedAt: Date.now(),
		test: {
			title: "IELTS Reading Mock 01",
			description: "",
			skill: "reading",
			timeLimitSeconds: 3600,
			collection: "Cambridge",
			testGroup: "",
		},
		slotDrafts: { p2: composerValue() },
		...overrides,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("assignment test draft store — schemaVersion 2 (Task 3.6)", () => {
	test("save → read returns full test meta + slot drafts (non-destructive)", () => {
		const store = fakeStorage();
		saveAssignmentTestDraft(testDraft(), store);
		const first = readAssignmentTestDraft(store);
		expect(first?.test).toEqual(testDraft().test);
		expect(first?.slotDrafts.p2).toEqual(composerValue());
		// Non-destructive: the draft stays until the teacher confirms/discard.
		expect(store.raw).not.toBeNull();
	});

	test("restore đủ state giữa chừng soạn 2 slot — refresh không mất draft", () => {
		const store = fakeStorage();
		const two = testDraft({
			slotDrafts: {
				p1: composerValue({
					part: "p1",
					type: "tfng",
					title: "Passage 1 TFNG",
				}),
				p2: composerValue(),
			},
		});
		saveAssignmentTestDraft(two, store);
		const restored = readAssignmentTestDraft(store);
		expect(Object.keys(restored?.slotDrafts ?? {}).sort()).toEqual([
			"p1",
			"p2",
		]);
		expect(restored?.slotDrafts.p1?.type).toBe("tfng");
		expect(restored?.slotDrafts.p2?.title).toBe("Passage 2 headings");
	});

	test("draft hỏng (parse lỗi) bị bỏ và xóa, không crash", () => {
		const store = fakeStorage();
		store.setItem(ASSIGNMENT_TEST_DRAFT_KEY, "{not json");
		expect(readAssignmentTestDraft(store)).toBeNull();
		expect(store.raw).toBeNull();

		store.setItem(
			ASSIGNMENT_TEST_DRAFT_KEY,
			JSON.stringify({ schemaVersion: 1, savedAt: Date.now() }),
		);
		// Version single-part phải bị từ chối — hai store không trộn shape.
		expect(readAssignmentTestDraft(store)).toBeNull();
		expect(store.raw).toBeNull();
	});

	test("slotDrafts corrupt bị từ chối (bỏ draft)", () => {
		const store = fakeStorage();
		const bad = testDraft();
		(bad.slotDrafts as Record<string, unknown>).p3 = { title: 123 };
		store.setItem(ASSIGNMENT_TEST_DRAFT_KEY, JSON.stringify(bad));
		expect(readAssignmentTestDraft(store)).toBeNull();
		expect(store.raw).toBeNull();
	});

	test("> 200KB bị skip; QuotaExceeded nuốt im lặng", () => {
		const store = fakeStorage();
		const huge = testDraft({
			test: {
				title: "x".repeat(ASSIGNMENT_TEST_DRAFT_MAX_LENGTH),
				description: "",
				skill: "reading",
				timeLimitSeconds: 3600,
				collection: "",
				testGroup: "",
			},
		});
		saveAssignmentTestDraft(huge, store);
		expect(store.raw).toBeNull();

		store.failNextWrites();
		expect(() => saveAssignmentTestDraft(testDraft(), store)).not.toThrow();
	});

	test("TTL 7 ngày — draft quá hạn bị xóa", () => {
		const store = fakeStorage();
		saveAssignmentTestDraft(
			testDraft({ savedAt: Date.now() - ASSIGNMENT_TEST_DRAFT_TTL_MS - 1 }),
			store,
		);
		expect(readAssignmentTestDraft(store)).toBeNull();
		expect(store.raw).toBeNull();
	});

	test("clear gỡ draft; key tách khỏi single-part store", () => {
		const store = fakeStorage();
		saveAssignmentTestDraft(testDraft(), store);
		clearAssignmentTestDraft(store);
		expect(store.raw).toBeNull();
		expect(ASSIGNMENT_TEST_DRAFT_KEY).toBe("teacher-os:test-draft:new");
	});

	test("testDraftHasContent: form mặc định không save, có slot draft thì save", () => {
		const emptyMeta = {
			title: "",
			description: "",
			skill: "reading",
			timeLimitSeconds: 3600,
			collection: "",
			testGroup: "",
		};
		expect(testDraftHasContent(emptyMeta, {})).toBe(false);
		expect(
			testDraftHasContent(emptyMeta, { p1: composerValue({ items: [] }) }),
		).toBe(true);
		expect(testDraftHasContent({ ...emptyMeta, title: "Mock 01" }, {})).toBe(
			true,
		);
	});

	test("slotDrafts giữ explanation hợp lệ, từ chối explanation null/số, và nhận diện explanation-only (#571)", () => {
		const emptyMeta = {
			title: "",
			description: "",
			skill: "reading",
			timeLimitSeconds: 3600,
			collection: "",
			testGroup: "",
		};
		const explanationOnlySlot = composerValue({
			title: "",
			source: "",
			passage: "",
			intro: "",
			items: [
				{
					stem: "",
					answer: "",
					opts: null,
					alts: "",
					explanation: "<p>Nháp giải thích</p>",
				},
			],
		});
		expect(testDraftHasContent(emptyMeta, { p1: explanationOnlySlot })).toBe(
			true,
		);
		expect(
			testDraftHasContent(emptyMeta, {
				p1: {
					...explanationOnlySlot,
					items: [
						{
							stem: "",
							answer: "",
							opts: null,
							alts: "",
							explanation: "<p></p>",
						},
					],
				},
			}),
		).toBe(false);

		const store = fakeStorage();
		saveAssignmentTestDraft(
			testDraft({ slotDrafts: { p1: explanationOnlySlot } }),
			store,
		);
		expect(
			readAssignmentTestDraft(store)?.slotDrafts.p1?.items[0]?.explanation,
		).toBe("<p>Nháp giải thích</p>");

		for (const badExplanation of [123, null]) {
			const slot = composerValue();
			const corrupt = testDraft({ slotDrafts: { p1: slot } });
			(slot.items[0] as unknown as Record<string, unknown>).explanation =
				badExplanation;
			store.setItem(ASSIGNMENT_TEST_DRAFT_KEY, JSON.stringify(corrupt));
			expect(readAssignmentTestDraft(store)).toBeNull();
		}
	});
});
