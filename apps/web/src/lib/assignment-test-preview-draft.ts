import type { QuestionItem } from "@/components/assignments/assignment-presets";

/**
 * Full-test preview handoff (phase-04 Task 4.1): builder → preview route qua
 * sessionStorage, mirror `assignment-preview-draft.ts` của single-part —
 * test-preview giữ store riêng, không nhồi vào draft single-part.
 *
 * Payload nguyên văn được nhúng khi ≤ ~1MB; vượt trần thì rơi sang ref
 * (Task 4.1 bước 2): chỉ lưu test id + slot map, route preview tự đọc
 * snapshot repo (`useData`) để dựng lại paper.
 */

export const TEST_PREVIEW_DRAFT_KEY = "teacher-os:test-preview-draft";
export const TEST_PREVIEW_DRAFT_SCHEMA_VERSION = 1;
/** Trần nhúng nguyên văn ~1MB (3 passage lớn + option banks). */
export const TEST_PREVIEW_DRAFT_MAX_LENGTH = 1024 * 1024;

export interface TestPreviewPartDraft {
	part: string;
	/** Label hiển thị từ preset slot ("Passage 1" / "Section 1"). */
	label: string;
	/** null = đánh số liên tục theo computeTestRanges. */
	qStartOverride: number | null;
	/** Part lấy từ ngân hàng — dựng lại ref fallback bằng id này. */
	promptId: string | null;
	/** Type id của prompt gắn slot (bank label + cloze layout). */
	type: string;
	title: string;
	intro: string;
	passage: string;
	/** Đề chữ (writing/speaking) — passage chỉ có ở reading. */
	prompt: string;
	/** File nghe placeholder (listening) — transcript KHÔNG bao giờ đưa vào. */
	audioName: string;
	optionBank: string[];
	items: QuestionItem[];
}

export interface TestPreviewDraft {
	schemaVersion: number;
	savedAt: number;
	test: {
		title: string;
		skill: string;
		timeLimitSeconds: number | null;
		collection: string;
		testGroup: string;
	};
	parts: TestPreviewPartDraft[];
}

/** Bản gọi save — save tự gắn schemaVersion + savedAt. */
export type TestPreviewDraftInput = Omit<
	TestPreviewDraft,
	"schemaVersion" | "savedAt"
>;

/**
 * Fallback >1MB (Task 4.1 bước 2): chỉ test id + slot map + header —
 * prompt data đọc lại từ snapshot ở route, không nhúng nguyên văn.
 */
export interface TestPreviewRefDraft {
	schemaVersion: number;
	savedAt: number;
	kind: "ref";
	testId: string | null;
	test: TestPreviewDraft["test"];
	/** part → promptId (chỉ slot đã gán). */
	assignedByPart: Record<string, string>;
}

export type TestPreviewHandoff = TestPreviewDraft | TestPreviewRefDraft;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function isQuestionItem(value: unknown): value is QuestionItem {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return typeof v.stem === "string" && typeof v.answer === "string";
}

function isPartDraft(value: unknown): value is TestPreviewPartDraft {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.part === "string" &&
		typeof v.label === "string" &&
		(v.qStartOverride === null || typeof v.qStartOverride === "number") &&
		(v.promptId === null || typeof v.promptId === "string") &&
		typeof v.type === "string" &&
		typeof v.title === "string" &&
		typeof v.intro === "string" &&
		typeof v.passage === "string" &&
		typeof v.prompt === "string" &&
		typeof v.audioName === "string" &&
		Array.isArray(v.optionBank) &&
		v.optionBank.every((row) => typeof row === "string") &&
		Array.isArray(v.items) &&
		v.items.every(isQuestionItem)
	);
}

function isTestHeader(value: unknown): value is TestPreviewDraft["test"] {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.title === "string" &&
		typeof v.skill === "string" &&
		(v.timeLimitSeconds === null || typeof v.timeLimitSeconds === "number") &&
		typeof v.collection === "string" &&
		typeof v.testGroup === "string"
	);
}

export function isTestPreviewRef(
	value: TestPreviewHandoff,
): value is TestPreviewRefDraft {
	return "kind" in value && value.kind === "ref";
}

/**
 * Persist handoff. Payload ≤ trần → nhúng nguyên văn; vượt trần → ref
 * (test id + slot map). QuotaExceeded nuốt im lặng — preview không bao giờ
 * chặn flow soạn.
 */
export function saveTestPreviewDraft(
	draft: TestPreviewDraftInput,
	testId: string | null = null,
	store: StorageLike | null = defaultStorage(),
): void {
	if (!store) return;
	const stamped: TestPreviewDraft = {
		...draft,
		schemaVersion: TEST_PREVIEW_DRAFT_SCHEMA_VERSION,
		savedAt: Date.now(),
	};
	const raw = JSON.stringify(stamped);
	if (raw.length <= TEST_PREVIEW_DRAFT_MAX_LENGTH) {
		try {
			store.setItem(TEST_PREVIEW_DRAFT_KEY, raw);
		} catch {}
		return;
	}
	const ref: TestPreviewRefDraft = {
		schemaVersion: TEST_PREVIEW_DRAFT_SCHEMA_VERSION,
		savedAt: stamped.savedAt,
		kind: "ref",
		testId,
		test: stamped.test,
		assignedByPart: Object.fromEntries(
			stamped.parts
				.filter((part) => part.promptId)
				.map((part) => [part.part, part.promptId as string]),
		),
	};
	try {
		store.setItem(TEST_PREVIEW_DRAFT_KEY, JSON.stringify(ref));
	} catch {}
}

/** Non-destructive read — reload preview vẫn hoạt động (mirror single-part). */
export function loadTestPreviewDraft(
	store: StorageLike | null = defaultStorage(),
): TestPreviewHandoff | null {
	try {
		const raw = store?.getItem(TEST_PREVIEW_DRAFT_KEY);
		if (!raw) return null;
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== "object") return null;
		const v = value as Record<string, unknown>;
		if (v.kind === "ref") {
			const assigned = v.assignedByPart;
			if (
				(v.testId === null || typeof v.testId === "string") &&
				isTestHeader(v.test) &&
				assigned &&
				typeof assigned === "object" &&
				Object.values(assigned).every((id) => typeof id === "string")
			)
				return value as TestPreviewRefDraft;
			return null;
		}
		if (
			isTestHeader(v.test) &&
			Array.isArray(v.parts) &&
			v.parts.every(isPartDraft)
		)
			return value as TestPreviewDraft;
		return null;
	} catch {
		return null;
	}
}

export function clearTestPreviewDraft(
	store: StorageLike | null = defaultStorage(),
): void {
	try {
		store?.removeItem(TEST_PREVIEW_DRAFT_KEY);
	} catch {}
}
