// @vitest-environment jsdom

import type { ReadingAnnotation } from "@teacher-os/ui/lib/reading-annotations";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearAllReadingAnnotationsStorage,
	loadReadingAnnotations,
	READING_ANNOTATIONS_MAX_BYTES,
	READING_ANNOTATIONS_MAX_STORED_ATTEMPTS,
	readingAnnotationsStorageKey,
	saveReadingAnnotations,
	useReadingAnnotationsStorage,
} from "@/lib/reading-annotations-store";
import { syncActiveStudentUser } from "@/lib/student-org-storage";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

function createMemoryStorage(): Storage & {
	setSpy: ReturnType<typeof vi.fn>;
	removeSpy: ReturnType<typeof vi.fn>;
	getSpy: ReturnType<typeof vi.fn>;
} {
	const map = new Map<string, string>();
	const getSpy = vi.fn((key: string) => map.get(key) ?? null);
	const setSpy = vi.fn((key: string, value: string) => {
		map.set(key, value);
	});
	const removeSpy = vi.fn((key: string) => {
		map.delete(key);
	});
	return {
		get length() {
			return map.size;
		},
		clear() {
			map.clear();
		},
		key(index: number) {
			return Array.from(map.keys())[index] ?? null;
		},
		getItem: getSpy,
		setItem: setSpy,
		removeItem: removeSpy,
		getSpy,
		setSpy,
		removeSpy,
	};
}

describe("reading-annotations-store", () => {
	it("uses a distinct key prefix separate from quiz-attempt answer mirror", () => {
		expect(readingAnnotationsStorageKey("att-123")).toBe(
			"quiz-reading-annotations:att-123",
		);
	});

	it("loads valid annotations, rejects corrupted/oversized/hash-mismatched/poisoned payloads, validates HTML canonicalText length, and never writes in load", () => {
		const htmlPassage = "<p>An là <strong>học sinh</strong> giỏi.</p>";
		// Parsed canonicalText is "An là học sinh giỏi." (length 20), NOT raw HTML length (43).
		const storage = createMemoryStorage();
		const valid: ReadingAnnotation[] = [
			{ id: "hl-1", start: 0, end: 5, note: "Đầu câu" },
		];
		saveReadingAnnotations("att-1", htmlPassage, valid, storage);
		storage.setSpy.mockClear();
		storage.removeSpy.mockClear();

		// Valid round-trip
		expect(loadReadingAnnotations("att-1", htmlPassage, storage)).toEqual(
			valid,
		);
		expect(storage.setSpy).not.toHaveBeenCalled();
		expect(storage.removeSpy).not.toHaveBeenCalled();

		// Hash mismatch (teacher edited passage) -> returns [] and NEVER mutates storage
		expect(
			loadReadingAnnotations("att-1", "<p>Bài đọc đã sửa.</p>", storage),
		).toEqual([]);
		expect(storage.setSpy).not.toHaveBeenCalled();
		expect(storage.removeSpy).not.toHaveBeenCalled();

		// Oversized raw JSON (> 256 KB) -> []
		storage.setItem(
			readingAnnotationsStorageKey("att-big"),
			"x".repeat(READING_ANNOTATIONS_MAX_BYTES + 10),
		);
		expect(loadReadingAnnotations("att-big", htmlPassage, storage)).toEqual([]);

		// Malformed JSON -> []
		storage.setItem(readingAnnotationsStorageKey("att-bad"), "{not-json");
		expect(loadReadingAnnotations("att-bad", htmlPassage, storage)).toEqual([]);

		// Poisoned payload (selector injection id, __proto__, NaN, float, out-of-canonical-bounds > 20)
		const rawSaved = JSON.parse(
			storage.getItem(readingAnnotationsStorageKey("att-1")) ?? "{}",
		) as { passageHash: string };
		storage.setItem(
			readingAnnotationsStorageKey("att-poison"),
			JSON.stringify({
				v: 1,
				passageHash: rawSaved.passageHash,
				updatedAt: Date.now(),
				items: [
					{ id: "ok-1", start: 0, end: 5, note: "safe" },
					{ id: "oob-html", start: 10, end: 35, note: "beyond canonical 20" },
					{ id: 'bad"id', start: 6, end: 9, note: "css injection" },
					{ id: "__proto__", start: 6, end: 9, note: "proto" },
					{ id: "float", start: 6.5, end: 9, note: "float" },
					{ id: "nan", start: null, end: 9, note: "nan" },
				],
			}),
		);
		expect(loadReadingAnnotations("att-poison", htmlPassage, storage)).toEqual([
			{ id: "ok-1", start: 0, end: 5, note: "safe" },
		]);

		// Private-mode getItem throwing -> []
		const throwingStorage = {
			...storage,
			getItem: () => {
				throw new Error("SecurityError");
			},
		};
		expect(
			loadReadingAnnotations("att-1", htmlPassage, throwingStorage),
		).toEqual([]);
	});

	it("removes key when empty, enforces LRU cap of 25 attempts without touching unrelated keys, and evicts on QuotaExceededError", () => {
		const passage = "<p>Tea history</p>";
		const storage = createMemoryStorage();
		storage.setItem("quiz-attempt:keep-me", '{"answers":{}}');
		storage.setItem("active_student_org_id", "org-1");

		let clock = 1000;
		const total = READING_ANNOTATIONS_MAX_STORED_ATTEMPTS + 3;
		for (let i = 1; i <= total; i += 1) {
			clock += 100;
			saveReadingAnnotations(
				`att-${i}`,
				passage,
				[{ id: `hl-${i}`, start: 0, end: 3, note: "" }],
				storage,
				() => clock,
			);
		}

		// Oldest 3 reading keys evicted; newest 25 kept; unrelated keys untouched
		expect(storage.getItem(readingAnnotationsStorageKey("att-1"))).toBeNull();
		expect(storage.getItem(readingAnnotationsStorageKey("att-2"))).toBeNull();
		expect(storage.getItem(readingAnnotationsStorageKey("att-3"))).toBeNull();
		expect(
			storage.getItem(readingAnnotationsStorageKey("att-4")),
		).not.toBeNull();
		expect(
			storage.getItem(readingAnnotationsStorageKey(`att-${total}`)),
		).not.toBeNull();
		expect(storage.getItem("quiz-attempt:keep-me")).toBe('{"answers":{}}');
		expect(storage.getItem("active_student_org_id")).toBe("org-1");

		// Empty items removes the key
		saveReadingAnnotations(`att-${total}`, passage, [], storage);
		expect(
			storage.getItem(readingAnnotationsStorageKey(`att-${total}`)),
		).toBeNull();

		// QuotaExceededError triggers eviction of oldest reading keys and 1 retry
		let quotaThrownOnce = false;
		const quotaStorage: Storage = {
			get length() {
				return storage.length;
			},
			clear: () => storage.clear(),
			key: (idx) => storage.key(idx),
			getItem: (k) => storage.getItem(k),
			removeItem: (k) => storage.removeItem(k),
			setItem: (k, v) => {
				if (!quotaThrownOnce) {
					quotaThrownOnce = true;
					throw new DOMException("Quota exceeded", "QuotaExceededError");
				}
				storage.setItem(k, v);
			},
		};
		saveReadingAnnotations(
			"att-retry",
			passage,
			[{ id: "hl-r", start: 0, end: 3, note: "saved after evict" }],
			quotaStorage,
			() => clock + 500,
		);
		expect(loadReadingAnnotations("att-retry", passage, storage)).toEqual([
			{ id: "hl-r", start: 0, end: 3, note: "saved after evict" },
		]);
		expect(storage.getItem("quiz-attempt:keep-me")).toBe('{"answers":{}}');
	});

	it("clears all reading annotation keys on logout or account switch via syncActiveStudentUser while preserving unrelated keys", () => {
		const passage = "<p>Shared computer passage.</p>";
		localStorage.setItem("theme", "dark");
		syncActiveStudentUser("user-1");
		saveReadingAnnotations("att-u1", passage, [
			{ id: "hl-1", start: 0, end: 6, note: "Private note" },
		]);
		expect(
			localStorage.getItem(readingAnnotationsStorageKey("att-u1")),
		).not.toBeNull();

		// Switching to another student clears previous student's reading notes
		syncActiveStudentUser("user-2");
		expect(
			localStorage.getItem(readingAnnotationsStorageKey("att-u1")),
		).toBeNull();
		expect(localStorage.getItem("theme")).toBe("dark");

		// Logout clears reading notes too
		saveReadingAnnotations("att-u2", passage, [
			{ id: "hl-2", start: 0, end: 6, note: "User 2 note" },
		]);
		syncActiveStudentUser(null);
		expect(
			localStorage.getItem(readingAnnotationsStorageKey("att-u2")),
		).toBeNull();
		expect(localStorage.getItem("theme")).toBe("dark");

		// Direct helper works safely on minimal storage stub without key/length
		clearAllReadingAnnotationsStorage({
			getItem: () => null,
			setItem: () => undefined,
			removeItem: () => undefined,
		} as unknown as Storage);
	});

	it("useReadingAnnotationsStorage initializes synchronously without flash and updates cleanly across attemptId/passage changes", () => {
		const passage = "<p>Synchronous hydration passage.</p>";
		const seeded: ReadingAnnotation[] = [
			{ id: "hl-sync", start: 0, end: 11, note: "Preloaded" },
		];
		saveReadingAnnotations("att-sync", passage, seeded);

		// Synchronous initial read on first render (no empty flash!)
		const { result, rerender } = renderHook(
			({ id, text }: { id: string | null; text: string }) =>
				useReadingAnnotationsStorage(id, text),
			{ initialProps: { id: "att-sync" as string | null, text: passage } },
		);
		expect(result.current[0]).toEqual(seeded);

		// Writing updates both state and localStorage
		act(() => {
			result.current[1]([
				...seeded,
				{ id: "hl-2", start: 12, end: 21, note: "Added" },
			]);
		});
		expect(result.current[0]).toHaveLength(2);
		expect(loadReadingAnnotations("att-sync", passage)).toHaveLength(2);

		// Null attemptId returns [] without touching stored key
		rerender({ id: null, text: passage });
		expect(result.current[0]).toEqual([]);
		expect(loadReadingAnnotations("att-sync", passage)).toHaveLength(2);

		// Restoring attemptId reloads saved annotations synchronously
		rerender({ id: "att-sync", text: passage });
		expect(result.current[0]).toHaveLength(2);
	});
});
