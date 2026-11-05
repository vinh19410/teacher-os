import type { AssignmentWritingSection } from "@teacher-os/api/contracts";
import type { QuestionItem } from "@/components/assignments/assignment-presets";

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
	skill?: string;
	part?: string;
	type?: string;
	passage?: string;
	intro?: string;
	transcript?: string;
	cueTopic?: string;
	cuePoints?: string;
	audioName?: string;
	imageUrl?: string;
	/** Phase-02 FR7 — the bank must survive the preview round trip like
	 * `transcript` does; dropping it here would silently wipe the panel. */
	optionBank?: string[];
	items?: QuestionItem[];
	writing?: AssignmentWritingSection | null;
	promptId?: string;
}
function isPreviewDraft(value: unknown): value is PreviewDraft {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.title === "string" &&
		typeof v.band === "string" &&
		typeof v.source === "string" &&
		typeof v.prompt === "string" &&
		typeof v.note === "string" &&
		(v.status === "draft" || v.status === "ready") &&
		(v.writing == null ||
			(typeof v.writing === "object" &&
				typeof (v.writing as Record<string, unknown>).part === "string" &&
				typeof (v.writing as Record<string, unknown>).type === "string" &&
				typeof (v.writing as Record<string, unknown>).prompt === "string")) &&
		(v.promptId === undefined || typeof v.promptId === "string")
	);
}
function storage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}
export function savePreviewDraft(draft: PreviewDraft): void {
	try {
		storage()?.setItem(PREVIEW_DRAFT_KEY, JSON.stringify(draft));
	} catch {}
}
export function readPreviewDraft(): PreviewDraft | null {
	try {
		const raw = storage()?.getItem(PREVIEW_DRAFT_KEY);
		if (!raw) return null;
		const value: unknown = JSON.parse(raw);
		return isPreviewDraft(value) ? value : null;
	} catch {
		return null;
	}
}
export function takePreviewDraft(): PreviewDraft | null {
	const value = readPreviewDraft();
	try {
		storage()?.removeItem(PREVIEW_DRAFT_KEY);
	} catch {}
	return value;
}
