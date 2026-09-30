import { describe, expect, test } from "vitest";
import {
	clearTestPreviewDraft,
	isTestPreviewRef,
	loadTestPreviewDraft,
	saveTestPreviewDraft,
	TEST_PREVIEW_DRAFT_KEY,
	TEST_PREVIEW_DRAFT_MAX_LENGTH,
	type TestPreviewDraft,
	type TestPreviewDraftInput,
} from "./assignment-test-preview-draft";

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
			return map.get(TEST_PREVIEW_DRAFT_KEY) ?? null;
		},
		failNextWrites() {
			failWrites = true;
		},
	};
}

function fullDraft(overrides: Partial<TestPreviewDraftInput> = {}) {
	const part = (index: number, count: number) => ({
		part: `p${index}`,
		label: `Passage ${index}`,
		qStartOverride: null,
		promptId: `prompt-${index}`,
		type: index === 2 ? "headings" : "tfng",
		title: `Passage ${index} — chủ đề ${index}`,
		intro: "Complete the sentences below.",
		passage: `Nội dung passage ${index} để đối chiếu round-trip.`,
		prompt: "",
		audioName: "",
		optionBank: index === 2 ? ["Heading một", "Heading hai"] : [],
		items: Array.from({ length: count }, (_, i) => ({
			stem: `p${index} câu ${i + 1} với ____`,
			answer: `ans-p${index}-${i}`,
			opts: null,
			alts: "",
		})),
	});
	return {
		test: {
			title: "IELTS Reading Mock 01",
			skill: "reading",
			timeLimitSeconds: 3600,
			collection: "Cambridge IELTS 18",
			testGroup: "TEST 5",
		},
		parts: [part(1, 13), part(2, 13), part(3, 14)],
		...overrides,
	};
}

describe("assignment-test-preview-draft (phase-04 Task 4.1)", () => {
	test("save→load round-trip giữ nguyên 40 câu + 3 passage", () => {
		const store = fakeStorage();
		saveTestPreviewDraft(fullDraft(), "at-1", store);
		const loaded = loadTestPreviewDraft(store);
		if (!loaded || isTestPreviewRef(loaded))
			throw new Error("expected embedded draft");
		const draft: TestPreviewDraft = loaded;
		expect(draft.test.title).toBe("IELTS Reading Mock 01");
		expect(draft.parts).toHaveLength(3);
		expect(draft.parts.reduce((sum, p) => sum + p.items.length, 0)).toBe(40);
		for (const part of draft.parts)
			expect(part.passage).toBe(
				`Nội dung passage ${part.part.slice(1)} để đối chiếu round-trip.`,
			);
		expect(draft.parts[1].optionBank).toEqual(["Heading một", "Heading hai"]);
	});

	test("payload >1MB rơi sang ref: chỉ test id + slot map, không nhúng nguyên văn", () => {
		const store = fakeStorage();
		const big = fullDraft();
		big.parts[1].passage = "x".repeat(TEST_PREVIEW_DRAFT_MAX_LENGTH);
		saveTestPreviewDraft(big, "at-9", store);
		// Nguyên văn KHÔNG nằm trong store.
		expect(store.raw).not.toContain("x".repeat(1000));
		const loaded = loadTestPreviewDraft(store);
		if (!loaded || !isTestPreviewRef(loaded))
			throw new Error("expected ref draft");
		expect(loaded.testId).toBe("at-9");
		expect(loaded.assignedByPart).toEqual({
			p1: "prompt-1",
			p2: "prompt-2",
			p3: "prompt-3",
		});
		expect(loaded.test.skill).toBe("reading");
	});

	test("clear xóa handoff; store rỗng/corrupt → null", () => {
		const store = fakeStorage();
		expect(loadTestPreviewDraft(store)).toBeNull();
		saveTestPreviewDraft(fullDraft(), null, store);
		clearTestPreviewDraft(store);
		expect(loadTestPreviewDraft(store)).toBeNull();
		store.setItem(TEST_PREVIEW_DRAFT_KEY, "{oops");
		expect(loadTestPreviewDraft(store)).toBeNull();
	});

	test("QuotaExceeded bị nuốt — save không bao giờ chặn flow soạn", () => {
		const store = fakeStorage();
		store.failNextWrites();
		expect(() => saveTestPreviewDraft(fullDraft(), null, store)).not.toThrow();
	});
});
