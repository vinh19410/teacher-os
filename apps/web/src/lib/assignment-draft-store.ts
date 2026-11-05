import { isEmptyRichText } from "@teacher-os/api/rich-text";
import type { ComposerValue } from "@/components/assignments/prompt-composer";

/**
 * Autosave draft store for `/assignments/new` (phase-01 FR6). Deliberately
 * separate from the sessionStorage preview draft (`assignment-preview-draft`):
 * the two stores have different lifetimes and the precedence rules live in
 * `new.tsx` — a preview draft beats the restore banner; this store never
 * touches sessionStorage.
 */

import { emptyItem } from "@/components/assignments/assignment-presets";
import { isValidPin } from "@/lib/image-pin";

export const ASSIGNMENT_DRAFT_KEY = "assignment-draft";
export const ASSIGNMENT_DRAFT_SCHEMA_VERSION = 1;
/** Teacher-visible drafts expire after a week (no infinite resurrect banner). */
export const ASSIGNMENT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * HTML drafts carry markup overhead (~2.5x the plain content via the contract
 * raw cap) — 512KB keeps a legal multi-passage payload under the ceiling.
 */
export const ASSIGNMENT_DRAFT_MAX_LENGTH = 512 * 1024;

export interface StoredAssignmentDraft {
	schemaVersion: number;
	savedAt: number;
	status: "draft" | "ready";
	value: ComposerValue;
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
	// `optionBank` (phase-02 FR3) may be absent on pre-phase-02 drafts —
	// missing falls back to [] via the freshComposer spread in new.tsx, but a
	// corrupted non-string-array value must be dropped, not crash the editor.
	if (
		v.optionBank !== undefined &&
		(!Array.isArray(v.optionBank) ||
			v.optionBank.some((row) => typeof row !== "string"))
	)
		return false;
	if (v.writing !== undefined && v.writing !== null) {
		if (typeof v.writing !== "object") return false;
		const w = v.writing as Record<string, unknown>;
		if (
			typeof w.part !== "string" ||
			typeof w.type !== "string" ||
			typeof w.prompt !== "string"
		)
			return false;
	}
	if (!Array.isArray(v.items)) return false;
	return v.items.every((rawItem) => {
		if (!rawItem || typeof rawItem !== "object") return false;
		const item = rawItem as QuestionItemShape;
		if (
			typeof item.stem !== "string" ||
			typeof item.answer !== "string" ||
			typeof item.alts !== "string"
		)
			return false;
		// `opts` is nullish-or-string[] on QuestionItem — a corrupted draft
		// (e.g. hand-edited `opts: "garbage"`) must be dropped, not crash the
		// grid's `.every`/`.map` over it (review #5).
		return (
			(item.opts == null ||
				(Array.isArray(item.opts) &&
					item.opts.every((option) => typeof option === "string"))) &&
			// `pin` (phase-04 FR1) is nullish-or-a-0–100 point — the same guard
			// as the snapshot read path; a corrupted draft must be dropped, not
			// handed to the pin editor as garbage.
			(item.pin == null || isValidPin(item.pin)) &&
			(item.explanation === undefined || typeof item.explanation === "string")
		);
	});
}

interface QuestionItemShape {
	stem: string;
	answer: string;
	alts: string;
	opts?: null | string[];
	pin?: null | { x: number; y: number };
	explanation?: unknown;
}

function draftShape(value: unknown): value is StoredAssignmentDraft {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.schemaVersion !== ASSIGNMENT_DRAFT_SCHEMA_VERSION) return false;
	if (typeof v.savedAt !== "number" || !Number.isFinite(v.savedAt))
		return false;
	if (v.status !== "draft" && v.status !== "ready") return false;
	return composerValueShape(v.value);
}

/**
 * Persist the draft. Oversized payloads are skipped and QuotaExceeded is
 * swallowed silently — autosave must never interrupt typing (FR6/security).
 */
export function saveAssignmentDraft(
	draft: StoredAssignmentDraft,
	store: StorageLike | null = defaultStorage(),
): void {
	if (!store) return;
	try {
		const serialized = JSON.stringify(draft);
		if (serialized.length > ASSIGNMENT_DRAFT_MAX_LENGTH) {
			// Not silent: a skipped save means the draft will be LOST on reload —
			// the console is the only channel autosave has to say so.
			console.warn(
				`Assignment draft skipped: ${serialized.length} chars exceed the ${ASSIGNMENT_DRAFT_MAX_LENGTH} cap.`,
			);
			return;
		}
		store.setItem(ASSIGNMENT_DRAFT_KEY, serialized);
	} catch {
		// QuotaExceeded / private-mode failures: keep composing, save nothing.
	}
}

/**
 * Non-destructive read: a valid draft stays in storage until the teacher
 * confirms the restore ("Tiếp tục") or discards it ("Hủy"). Invalid, expired
 * and version-mismatched payloads are dropped so they can never resurrect.
 */
export function readAssignmentDraft(
	store: StorageLike | null = defaultStorage(),
): StoredAssignmentDraft | null {
	try {
		const raw = store?.getItem(ASSIGNMENT_DRAFT_KEY);
		if (!raw) return null;
		const value: unknown = JSON.parse(raw);
		if (!draftShape(value)) {
			store?.removeItem(ASSIGNMENT_DRAFT_KEY);
			return null;
		}
		if (Date.now() - value.savedAt > ASSIGNMENT_DRAFT_TTL_MS) {
			store?.removeItem(ASSIGNMENT_DRAFT_KEY);
			return null;
		}
		return value;
	} catch {
		try {
			store?.removeItem(ASSIGNMENT_DRAFT_KEY);
		} catch {
			// unreadable storage: nothing else to do
		}
		return null;
	}
}

export function clearAssignmentDraft(
	store: StorageLike | null = defaultStorage(),
): void {
	try {
		store?.removeItem(ASSIGNMENT_DRAFT_KEY);
	} catch {
		// clearing is best-effort
	}
}

/**
 * Whether the composer carries anything worth autosaving. A fresh composer
 * (only defaults) must not be written — otherwise clearing the draft and
 * resetting would immediately re-save an empty draft and resurrect the
 * banner on the next visit.
 */
export function composerDraftHasContent(value: ComposerValue): boolean {
	// Rich fields are HTML — "<p></p>" must not trigger an autosave. Plain
	// fields (cuePoints, audioName, imageUrl, title, source) keep .trim().
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
	if (value.writing && !isEmptyRichText(value.writing.prompt)) return true;
	// `?? []`: pre-phase-02 drafts may legitimately lack the field at runtime.
	if ((value.optionBank ?? []).some((row) => row.trim())) return true;
	const blank = emptyItem(value.type);
	return value.items.some(
		(item) =>
			item.stem.trim() ||
			item.answer.trim() ||
			item.alts.trim() ||
			Boolean(item.explanation && !isEmptyRichText(item.explanation)) ||
			// re-place every label by hand (phase-04 FR3).
			item.pin != null ||
			JSON.stringify(item.opts ?? blank.opts) !== JSON.stringify(blank.opts),
	);
}
