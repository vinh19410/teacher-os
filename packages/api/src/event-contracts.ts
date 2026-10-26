import { z } from "zod";

export const ORG_EVENT_TITLE_MIN = 2;
export const ORG_EVENT_TITLE_MAX = 100;
export const ORG_EVENT_NOTE_MAX = 500;

/** Dòng org_event trong snapshot kernel — shape băng froze cho view-model lịch. */
export interface KernelEventRow {
	id: string;
	title: string;
	/** yyyy-mm-dd */
	date: string;
	/** HH:mm */
	startTime: string;
	/** HH:mm */
	endTime: string;
	note: string;
	createdAt?: string;
	createdByUserId?: string;
}

export type OrgEvent = KernelEventRow;

/** Strict yyyy-mm-dd hợp lệ lịch (2026-02-30 bị từ chối). */
function isCalendarDate(raw: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
	const parsed = new Date(`${raw}T00:00:00Z`);
	return (
		!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw
	);
}

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const orgEventDraftSchema = z
	.object({
		title: z.string().trim().min(ORG_EVENT_TITLE_MIN).max(ORG_EVENT_TITLE_MAX),
		date: z.string().refine(isCalendarDate),
		startTime: z.string().regex(HHMM_REGEX),
		endTime: z.string().regex(HHMM_REGEX),
		note: z.string().max(ORG_EVENT_NOTE_MAX).default(""),
	})
	.refine((draft) => draft.endTime > draft.startTime, {
		path: ["endTime"],
	});
export type OrgEventDraft = z.infer<typeof orgEventDraftSchema>;
