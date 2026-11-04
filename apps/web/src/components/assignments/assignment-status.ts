import {
	evaluateAssignmentDeadline,
	formatVietnamTimeHHMM,
	vietnamDateKeyOf,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";

export type StatusTone =
	| "ok"
	| "warn"
	| "danger"
	| "neutral"
	| "draft"
	| "used";

export type RollupKind = "Đã nộp hết" | "Quá hạn" | "Đang mở";

export interface RollupResult {
	label: RollupKind;
	tone: "ok" | "danger" | "neutral";
}

export type StudentSubmissionKind =
	| "Đã nộp"
	| "Đã nộp · trễ hạn"
	| "Chưa nộp · quá hạn"
	| "Chưa nộp";

export interface StudentSubmissionResult {
	label: StudentSubmissionKind;
	tone: "ok" | "warn" | "danger" | "neutral";
}

export interface PromptStatusResult {
	label: string;
	tone: "draft" | "used" | "ok";
}

/** Format ISO yyyy-mm-dd → dd/mm/yyyy (calendar date display). */
export function fmtDue(iso: string): string {
	const parts = iso.trim().split("-");
	if (parts.length !== 3) return iso;
	return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Hiển thị hạn nộp: khi có `dueAt` hợp lệ thì hiển thị `"HH:mm dd/mm/yyyy"`
 * theo múi giờ Việt Nam (cả giờ lẫn ngày lấy từ `dueAt`); ngược lại hiển thị
 * `fmtDue(due)` (`dd/mm/yyyy`).
 */
export function fmtDueDisplay(due: string, dueAt?: string | null): string {
	const rawDueAtMs = dueAt ? Date.parse(dueAt) : Number.NaN;
	if (Number.isFinite(rawDueAtMs)) {
		const timeStr = formatVietnamTimeHHMM(rawDueAtMs);
		const dateISO = vietnamDateKeyOf(new Date(rawDueAtMs));
		return `${timeStr} ${fmtDue(dateISO)}`;
	}
	return fmtDue(due);
}

/** Format ISO datetime string or yyyy-mm-dd → dd/mm/yyyy in Vietnam timezone. */
export function fmtDate(iso: string): string {
	if (!iso) return "";
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) {
			return fmtDue(iso.slice(0, 10));
		}
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Ho_Chi_Minh",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).formatToParts(d);
		const get = (type: string) =>
			parts.find((p) => p.type === type)?.value ?? "00";
		return `${get("day")}/${get("month")}/${get("year")}`;
	} catch {
		return iso;
	}
}

/** Format ISO datetime (e.g. 2026-09-11T21:14:00) → dd/mm/yyyy · HH:mm. */
export function fmtWhen(iso: string): string {
	if (!iso) return "";
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) {
			const [datePart, timePart = "00:00"] = iso.split("T");
			return `${fmtDue(datePart || "")} · ${timePart.slice(0, 5)}`;
		}
		const parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: "Asia/Ho_Chi_Minh",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).formatToParts(d);
		const get = (type: string) =>
			parts.find((p) => p.type === type)?.value ?? "00";
		return `${get("day")}/${get("month")}/${get("year")} · ${get("hour")}:${get("minute")}`;
	} catch {
		return iso;
	}
}

/** Extract calendar yyyy-mm-dd from a submission timestamp in VN timezone. */
export function extractDateISO(submittedAt: string): string {
	try {
		const d = new Date(submittedAt);
		if (!Number.isNaN(d.getTime())) {
			return vietnamTodayISO(d);
		}
	} catch {
		// fallback
	}
	return submittedAt.slice(0, 10);
}

/**
 * Rollup trạng thái cấp bài giao (v2):
 * - Đã nộp hết (ok) nếu tất cả target đã có submittedAt
 * - Quá hạn (danger) nếu chưa đủ && due < today
 * - Đang mở (neutral) còn lại
 * Guard 0-target → Đang mở (red-team F2).
 */
export function rollupStatus(
	assignment: {
		due: string;
		dueAt?: string | null;
		targets: Array<{ submittedAt: string | null }>;
	},
	todayISO: string,
	nowMs?: number,
): RollupResult {
	if (assignment.targets.length === 0) {
		return { label: "Đang mở", tone: "neutral" };
	}
	const submittedCount = assignment.targets.filter(
		(t) => t.submittedAt !== null,
	).length;
	if (submittedCount === assignment.targets.length) {
		return { label: "Đã nộp hết", tone: "ok" };
	}
	const deadline = evaluateAssignmentDeadline({
		due: assignment.due,
		dueAt: assignment.dueAt,
		submittedAt: null,
		todayISO,
		nowMs,
	});
	if (deadline.isOverdue) {
		return { label: "Quá hạn", tone: "danger" };
	}
	return { label: "Đang mở", tone: "neutral" };
}

/**
 * Trạng thái nộp cấp học viên (v2, #572):
 * - Khi `dueAt` khác null: so sánh chính xác theo mili-giây (`submittedMs > dueAtMs` → trễ hạn;
 *   chưa nộp `nowMs >= dueAtMs` → quá hạn).
 * - Khi `dueAt` null (dữ liệu cũ): giữ nguyên so ngày theo múi giờ Việt Nam.
 */
export function studentSubmissionStatus(
	target: { submittedAt: string | null },
	due: string,
	todayISO: string,
	options?: { dueAt?: string | null; nowMs?: number },
): StudentSubmissionResult {
	const deadline = evaluateAssignmentDeadline({
		due,
		dueAt: options?.dueAt,
		submittedAt: target.submittedAt,
		todayISO,
		nowMs: options?.nowMs,
		legacyDateLate: true,
	});
	if (target.submittedAt !== null) {
		if (deadline.isLate) {
			return { label: "Đã nộp · trễ hạn", tone: "warn" };
		}
		return { label: "Đã nộp", tone: "ok" };
	}
	if (deadline.isOverdue) {
		return { label: "Chưa nộp · quá hạn", tone: "danger" };
	}
	return { label: "Chưa nộp", tone: "neutral" };
}

/**
 * Tag trạng thái cho hàng đề trong ngân hàng:
 * - draft → Bản nháp (draft tone)
 * - used > 0 → Đã dùng {N} lớp (used tone)
 * - ready, chưa dùng → Sẵn sàng (ok tone)
 */
export function promptStatus(status: string, used: number): PromptStatusResult {
	if (status === "draft") {
		return { label: "Bản nháp", tone: "draft" };
	}
	if (used > 0) {
		return { label: `Đã dùng ${used} lớp`, tone: "used" };
	}
	return { label: "Sẵn sàng", tone: "ok" };
}
