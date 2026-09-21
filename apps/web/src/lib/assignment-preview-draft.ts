export const PREVIEW_DRAFT_KEY = "teacher-os:assignment-preview-draft";

export interface PreviewDraft {
	task: string;
	genre: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	note: string;
	status: "draft" | "ready";
}

function isPreviewDraft(value: unknown): value is PreviewDraft {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	if (
		typeof v.task !== "string" ||
		typeof v.genre !== "string" ||
		typeof v.title !== "string" ||
		typeof v.band !== "string" ||
		typeof v.source !== "string" ||
		typeof v.prompt !== "string" ||
		typeof v.note !== "string"
	) {
		return false;
	}
	return v.status === "draft" || v.status === "ready";
}

function sessionStorageSafe(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

/** Overwrite the preview snapshot. No-op when storage is unavailable. */
export function savePreviewDraft(draft: PreviewDraft): void {
	const storage = sessionStorageSafe();
	if (!storage) return;
	try {
		storage.setItem(PREVIEW_DRAFT_KEY, JSON.stringify(draft));
	} catch {
		// privacy mode / quota — preview simply won't work, form unaffected.
	}
}

/** Read the snapshot without clearing it (reload of the preview page keeps
 * working). Returns null when absent, malformed, or storage is unavailable. */
export function readPreviewDraft(): PreviewDraft | null {
	const storage = sessionStorageSafe();
	if (!storage) return null;
	try {
		const raw = storage.getItem(PREVIEW_DRAFT_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		return isPreviewDraft(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/** Read-and-clear: the create page consumes the snapshot once on mount. */
export function takePreviewDraft(): PreviewDraft | null {
	const storage = sessionStorageSafe();
	if (!storage) return null;
	try {
		const draft = readPreviewDraft();
		storage.removeItem(PREVIEW_DRAFT_KEY);
		return draft;
	} catch {
		return null;
	}
}
