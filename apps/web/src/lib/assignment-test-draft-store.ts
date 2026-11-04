import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { emptyItem } from "@/components/assignments/assignment-presets";
import type { ComposerValue } from "@/components/assignments/prompt-composer";
import { isValidPin } from "@/lib/image-pin";

/**
 * Autosave draft store cho full-test builder (`/assignments/tests/new`,
 * phase-03 Task 3.6). Shape RIÊNG schemaVersion 2 — không tái dùng
 * `StoredAssignmentDraft` (schemaVersion 1) của `/assignments/new`: hai
 * màn hình là hai máy trạng thái khác nhau và draft single-part phải nằm
 * yên khi giáo viên soạn full test. Key localStorage khác namespace
 * (`teacher-os:test-draft:*`) để hai store không bao giờ giẫm nhau.
 */

export const ASSIGNMENT_TEST_DRAFT_KEY = "teacher-os:test-draft:new";
export const ASSIGNMENT_TEST_DRAFT_SCHEMA_VERSION = 2;
/** Teacher-visible drafts expire after a week (no infinite resurrect banner). */
export const ASSIGNMENT_TEST_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * 3 passage × ~20KB plain, inflated ~2.5x by HTML markup (contract raw cap)
 * — 512KB keeps a legal full-test payload under the ceiling.
 */
export const ASSIGNMENT_TEST_DRAFT_MAX_LENGTH = 512 * 1024;

export interface StoredAssignmentTestDraft {
	schemaVersion: number;
	savedAt: number;
	test: {
		title: string;
		description: string;
		skill: string;
		timeLimitSeconds: number | null;
		collection: string;
		testGroup: string;
	};
	/** Composer draft theo slot (part → giá trị composer nhúng; null = trống). */
	slotDrafts: Record<string, ComposerValue | null>;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/**
 * Same shape contract as `composerValueShape` ở assignment-draft-store
 * (file đó không được đổi theo plan — validator nhân bản ở đây, giữ rule
 * ăn khớp: string fields, optionBank string[]|undefined, items với
 * opts/pin defensive).
 */
function composerValueShape(value: unknown): value is ComposerValue {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	const stringFields = [
		"skill",
		"part",
		"type",
		"title",
		"band",
		"source",
		"prompt",
		"passage",
		"intro",
		"transcript",
		"cueTopic",
		"cuePoints",
		"audioName",
		"imageUrl",
		"note",
	] as const;
	if (!stringFields.every((field) => typeof v[field] === "string"))
		return false;
	if (
		v.optionBank !== undefined &&
		(!Array.isArray(v.optionBank) ||
			v.optionBank.some((row) => typeof row !== "string"))
	)
		return false;
	if (!Array.isArray(v.items)) return false;
	return v.items.every((rawItem) => {
		if (!rawItem || typeof rawItem !== "object") return false;
		const item = rawItem as {
			stem: unknown;
			answer: unknown;
			alts: unknown;
			opts?: unknown;
			pin?: unknown;
			explanation?: unknown;
		};
		if (
			typeof item.stem !== "string" ||
			typeof item.answer !== "string" ||
			typeof item.alts !== "string"
		)
			return false;
		return (
			(item.opts == null ||
				(Array.isArray(item.opts) &&
					item.opts.every((option) => typeof option === "string"))) &&
			(item.pin == null || isValidPin(item.pin)) &&
			(item.explanation === undefined || typeof item.explanation === "string")
		);
	});
}

function testMetaShape(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.title === "string" &&
		typeof v.description === "string" &&
		typeof v.skill === "string" &&
		(v.timeLimitSeconds === null ||
			(typeof v.timeLimitSeconds === "number" &&
				Number.isFinite(v.timeLimitSeconds))) &&
		typeof v.collection === "string" &&
		typeof v.testGroup === "string"
	);
}

function testDraftShape(value: unknown): value is StoredAssignmentTestDraft {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.schemaVersion !== ASSIGNMENT_TEST_DRAFT_SCHEMA_VERSION) return false;
	if (typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt))
		return false;
	if (!testMetaShape(v.test)) return false;
	if (!v.slotDrafts || typeof v.slotDrafts !== "object") return false;
	return Object.values(v.slotDrafts).every(
		(entry) => entry === null || composerValueShape(entry),
	);
}

/**
 * Persist the draft. Oversized payloads are skipped and QuotaExceeded is
 * swallowed silently — autosave must never interrupt composing.
 */
export function saveAssignmentTestDraft(
	draft: StoredAssignmentTestDraft,
	store: StorageLike | null = defaultStorage(),
): void {
	if (!store) return;
	try {
		const serialized = JSON.stringify(draft);
		if (serialized.length > ASSIGNMENT_TEST_DRAFT_MAX_LENGTH) {
			// Not silent: a skipped save means the draft will be LOST on reload.
			console.warn(
				`Test draft skipped: ${serialized.length} chars exceed the ${ASSIGNMENT_TEST_DRAFT_MAX_LENGTH} cap.`,
			);
			return;
		}
		store.setItem(ASSIGNMENT_TEST_DRAFT_KEY, serialized);
	} catch {
		// QuotaExceeded / private-mode failures: keep composing, save nothing.
	}
}

/**
 * Non-destructive read: a valid draft stays in storage until the teacher
 * confirms the restore ("Tiếp tục") or discards it ("Hủy"). Invalid,
 * expired and version-mismatched payloads are dropped so they can never
 * resurrect.
 */
export function readAssignmentTestDraft(
	store: StorageLike | null = defaultStorage(),
): StoredAssignmentTestDraft | null {
	try {
		const raw = store?.getItem(ASSIGNMENT_TEST_DRAFT_KEY);
		if (!raw) return null;
		const value: unknown = JSON.parse(raw);
		if (!testDraftShape(value)) {
			store?.removeItem(ASSIGNMENT_TEST_DRAFT_KEY);
			return null;
		}
		if (Date.now() - value.savedAt > ASSIGNMENT_TEST_DRAFT_TTL_MS) {
			store?.removeItem(ASSIGNMENT_TEST_DRAFT_KEY);
			return null;
		}
		return value;
	} catch {
		try {
			store?.removeItem(ASSIGNMENT_TEST_DRAFT_KEY);
		} catch {
			// unreadable storage: nothing else to do
		}
		return null;
	}
}

export function clearAssignmentTestDraft(
	store: StorageLike | null = defaultStorage(),
): void {
	try {
		store?.removeItem(ASSIGNMENT_TEST_DRAFT_KEY);
	} catch {
		// clearing is best-effort
	}
}

/**
 * Whether the test builder carries anything worth autosaving — a fresh
 * form (default header, mọi slot trống) must not be written, otherwise
 * clearing the draft would immediately re-save an empty one and resurrect
 * the banner on the next visit.
 */
export function testDraftHasContent(
	test: StoredAssignmentTestDraft["test"],
	slotDrafts: StoredAssignmentTestDraft["slotDrafts"],
): boolean {
	if (
		test.title.trim() ||
		!isEmptyRichText(test.description) ||
		test.collection.trim() ||
		test.testGroup.trim()
	)
		return true;
	return Object.values(slotDrafts).some(
		(draft) => draft !== null && composerDraftHasContent(draft),
	);
}

/**
 * Local mirror of the single-part store's content check — the two stores have
 * separate shapes and validators, so this stays a hand-synced copy.
 */
function composerDraftHasContent(value: ComposerValue): boolean {
	// Rich fields are HTML — "<p></p>" must not trigger an autosave.
	if (
		value.title.trim() ||
		value.source.trim() ||
		!isEmptyRichText(value.prompt) ||
		!isEmptyRichText(value.passage) ||
		!isEmptyRichText(value.intro) ||
		!isEmptyRichText(value.transcript) ||
		value.cueTopic.trim() ||
		value.cuePoints.trim() ||
		value.audioName.trim() ||
		value.imageUrl.trim() ||
		!isEmptyRichText(value.note)
	)
		return true;
	if ((value.optionBank ?? []).some((row) => row.trim())) return true;
	const blank = emptyItem(value.type);
	return value.items.some(
		(item) =>
			item.stem.trim() ||
			item.answer.trim() ||
			item.alts.trim() ||
			Boolean(item.explanation && !isEmptyRichText(item.explanation)) ||
			item.pin != null ||
			JSON.stringify(item.opts ?? blank.opts) !== JSON.stringify(blank.opts),
	);
}
