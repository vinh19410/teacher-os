import {
	buildPassageModel,
	hashPassage,
	normalizeReadingAnnotations,
	READING_ANNOTATION_MAX_ITEMS,
	type ReadingAnnotation,
} from "@teacher-os/ui/lib/reading-annotations";
import { useCallback, useState } from "react";

/** Prefix riêng tách hẳn khỏi `quiz-attempt:{attemptId}` để sống sót qua `finalize()` và xem lại read-only. */
export const READING_ANNOTATIONS_STORAGE_PREFIX = "quiz-reading-annotations:";
/** Giới hạn dung lượng JSON thô cho mỗi attempt (256 KB) chống localStorage poisoning/bloat. */
export const READING_ANNOTATIONS_MAX_BYTES = 262_144;
/** Giới hạn số attempt giữ lại theo LRU để không làm đầy quota của `QuizAttemptStore.writeMirror`. */
export const READING_ANNOTATIONS_MAX_STORED_ATTEMPTS = 25;

const QUOTA_EVICT_BATCH = 5;

type StorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem" | "key" | "length"
>;

interface StoredReadingAnnotationsPayload {
	v: 1;
	passageHash: string;
	updatedAt: number;
	items: ReadingAnnotation[];
}

export function readingAnnotationsStorageKey(attemptId: string): string {
	return `${READING_ANNOTATIONS_STORAGE_PREFIX}${attemptId}`;
}

function defaultStorage(): StorageLike | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function listReadingAnnotationKeys(storage: Partial<StorageLike>): string[] {
	if (typeof storage.length !== "number" || typeof storage.key !== "function") {
		return [];
	}
	const keys: string[] = [];
	try {
		for (let i = 0; i < storage.length; i += 1) {
			const k = storage.key(i);
			if (k?.startsWith(READING_ANNOTATIONS_STORAGE_PREFIX)) {
				keys.push(k);
			}
		}
	} catch {
		// Storage stub hoặc trình duyệt chặn duyệt key — bỏ qua an toàn.
	}
	return keys;
}

function readUpdatedAt(storage: Partial<StorageLike>, key: string): number {
	try {
		const raw = storage.getItem?.(key);
		if (!raw || raw.length > READING_ANNOTATIONS_MAX_BYTES) return 0;
		const parsed = JSON.parse(raw) as { updatedAt?: unknown } | null;
		const ts = parsed?.updatedAt;
		return typeof ts === "number" && Number.isFinite(ts) ? ts : 0;
	} catch {
		return 0;
	}
}

function evictOldestReadingKeys(
	storage: Partial<StorageLike>,
	excludeKey: string,
	keepMax: number,
): number {
	const otherKeys = listReadingAnnotationKeys(storage).filter(
		(k) => k !== excludeKey,
	);
	if (otherKeys.length <= keepMax) return 0;
	const ranked = otherKeys
		.map((k) => ({ key: k, updatedAt: readUpdatedAt(storage, k) }))
		.sort((a, b) => a.updatedAt - b.updatedAt);
	const removeCount = ranked.length - keepMax;
	let removed = 0;
	for (let i = 0; i < removeCount; i += 1) {
		const entry = ranked[i];
		if (!entry) continue;
		try {
			storage.removeItem?.(entry.key);
			removed += 1;
		} catch {
			// Best-effort eviction
		}
	}
	return removed;
}

/**
 * Đọc danh sách highlight/ghi chú cho `attemptId` — thuần READ-ONLY (tuyệt đối
 * không ghi hay xoá storage kể cả khi `passageHash` lệch).
 */
export function loadReadingAnnotations(
	attemptId: string,
	passage: string,
	storage: Partial<StorageLike> | undefined = defaultStorage(),
): ReadingAnnotation[] {
	if (!storage || !attemptId || !passage) return [];
	const key = readingAnnotationsStorageKey(attemptId);
	let raw: string | null = null;
	try {
		raw = storage.getItem?.(key) ?? null;
	} catch {
		return [];
	}
	if (!raw || raw.length > READING_ANNOTATIONS_MAX_BYTES) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return [];
	}
	const payload = parsed as {
		v?: unknown;
		passageHash?: unknown;
		items?: unknown;
	};
	if (
		payload.v !== 1 ||
		typeof payload.passageHash !== "string" ||
		payload.passageHash !== hashPassage(passage) ||
		!Array.isArray(payload.items)
	) {
		return [];
	}

	const model = buildPassageModel(passage);
	const candidates: ReadingAnnotation[] = [];
	const rawItems: readonly unknown[] = payload.items;
	const rawSlice = rawItems.slice(0, READING_ANNOTATION_MAX_ITEMS * 2);
	for (const entry of rawSlice) {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			continue;
		}
		const rec = entry as Record<string, unknown>;
		if (
			typeof rec.id === "string" &&
			typeof rec.start === "number" &&
			typeof rec.end === "number" &&
			typeof rec.note === "string"
		) {
			candidates.push({
				id: rec.id,
				start: rec.start,
				end: rec.end,
				note: rec.note,
			});
		}
	}
	return normalizeReadingAnnotations(candidates, model.canonicalText.length);
}

/**
 * Lưu danh sách highlight/ghi chú theo `attemptId`, có LRU cap (25 attempt) và
 * tự evict các bản cũ nhất khi gặp `QuotaExceededError`. Trả về danh sách đã chuẩn hoá
 * để caller tái sử dụng mà không phải parse lại `buildPassageModel`.
 */
export function saveReadingAnnotations(
	attemptId: string,
	passage: string,
	items: readonly ReadingAnnotation[],
	storage: Partial<StorageLike> | undefined = defaultStorage(),
	now: () => number = Date.now,
): ReadingAnnotation[] {
	if (!attemptId || !passage) return [];
	const key = readingAnnotationsStorageKey(attemptId);
	const model = buildPassageModel(passage);
	const normalized = normalizeReadingAnnotations(
		items,
		model.canonicalText.length,
	);
	if (!storage) return normalized;

	if (normalized.length === 0) {
		try {
			storage.removeItem?.(key);
		} catch {
			// Best-effort cleanup
		}
		return [];
	}

	// Giữ tối đa (MAX - 1) key khác để sau khi ghi key hiện tại tổng số <= MAX.
	evictOldestReadingKeys(
		storage,
		key,
		Math.max(0, READING_ANNOTATIONS_MAX_STORED_ATTEMPTS - 1),
	);

	const payload: StoredReadingAnnotationsPayload = {
		v: 1,
		passageHash: model.passageHash,
		updatedAt: now(),
		items: normalized,
	};
	const serialized = JSON.stringify(payload);
	if (serialized.length > READING_ANNOTATIONS_MAX_BYTES) return normalized;

	try {
		storage.setItem?.(key, serialized);
	} catch {
		// QuotaExceededError: dọn bớt key đọc cũ nhất rồi thử ghi lại 1 lần để không mất bài.
		const otherKeys = listReadingAnnotationKeys(storage).filter(
			(k) => k !== key,
		);
		const targetKeep = Math.max(0, otherKeys.length - QUOTA_EVICT_BATCH);
		const evicted = evictOldestReadingKeys(storage, key, targetKeep);
		if (evicted > 0) {
			try {
				storage.setItem?.(key, serialized);
			} catch {
				// Best-effort: không bao giờ làm vỡ UI làm bài thi.
			}
		}
	}
	return normalized;
}

/** Xoá toàn bộ highlight/ghi chú bài đọc trên trình duyệt hiện tại (gọi khi đăng xuất / đổi tài khoản). */
export function clearAllReadingAnnotationsStorage(
	storage: Partial<StorageLike> | undefined = defaultStorage(),
): void {
	if (!storage) return;
	const keys = listReadingAnnotationKeys(storage);
	for (const key of keys) {
		try {
			storage.removeItem?.(key);
		} catch {
			// Best-effort cleanup
		}
	}
}

/**
 * React hook đồng bộ state với `localStorage` ngay trong pha render (không nháy
 * trạng thái rỗng khi reload hay qua `QuizResumeDialog`, và không bao giờ ghi/xoá
 * storage trong render/effect).
 */
export function useReadingAnnotationsStorage(
	attemptId: string | null,
	passage: string,
): [ReadingAnnotation[], (next: ReadingAnnotation[]) => void] {
	const syncKey =
		attemptId && passage ? `${attemptId}::${hashPassage(passage)}` : "";

	const [state, setState] = useState<{
		key: string;
		items: ReadingAnnotation[];
	}>(() => ({
		key: syncKey,
		items:
			attemptId && passage ? loadReadingAnnotations(attemptId, passage) : [],
	}));

	let currentItems = state.items;
	if (state.key !== syncKey) {
		currentItems =
			attemptId && passage ? loadReadingAnnotations(attemptId, passage) : [];
		setState({ key: syncKey, items: currentItems });
	}

	const setItems = useCallback(
		(next: ReadingAnnotation[]) => {
			if (!attemptId || !passage) return;
			const nextKey = `${attemptId}::${hashPassage(passage)}`;
			const normalized = saveReadingAnnotations(attemptId, passage, next);
			setState({ key: nextKey, items: normalized });
		},
		[attemptId, passage],
	);

	return [currentItems, setItems];
}
