import type {
	StudentAssignment,
	StudentAssignmentScores,
} from "@teacher-os/api/contracts";
import { hasGradableTask } from "@teacher-os/api/lib/ielts-band";
import {
	evaluateAssignmentDeadline,
	formatVietnamTimeHHMM,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";

export type AssignmentDisplayStatus =
	| "overdue"
	| "due-soon"
	| "not-submitted"
	| "submitted"
	| "graded";

export interface DerivedAssignmentStatus {
	status: AssignmentDisplayStatus;
	statusLabel: string;
	badgeClass: string;
	dueText: string;
	bandScore: number | null;
	sortOrder: number;
	isLate?: boolean;
}

/**
 * IELTS overall band rounding:
 * Mean of 4 criteria rounded to the nearest half band.
 * .25 rounds up to .5; .75 rounds up to next whole band.
 */
export function calculateIeltsBand(
	scores: StudentAssignmentScores | null,
): number | null {
	if (!scores) return null;
	const { task, coherence, lexical, grammar } = scores;
	if (
		typeof task !== "number" ||
		typeof coherence !== "number" ||
		typeof lexical !== "number" ||
		typeof grammar !== "number"
	) {
		return null;
	}
	const mean = (task + coherence + lexical + grammar) / 4;
	const floor = Math.floor(mean);
	const frac = mean - floor;
	if (frac < 0.25) {
		return floor;
	}
	if (frac < 0.75) {
		return floor + 0.5;
	}
	return floor + 1;
}

function parseISODate(dateStr: string): {
	year: number;
	month: number;
	day: number;
} | null {
	if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return null;
	}
	const [y, m, d] = dateStr.split("-").map(Number);
	if (!y || !m || !d) return null;
	return { year: y, month: m, day: d };
}

function daysDiff(fromISO: string, toISO: string): number | null {
	const pFrom = parseISODate(fromISO);
	const pTo = parseISODate(toISO);
	if (!pFrom || !pTo) return null;

	const dFrom = Date.UTC(pFrom.year, pFrom.month - 1, pFrom.day);
	const dTo = Date.UTC(pTo.year, pTo.month - 1, pTo.day);
	return Math.round((dTo - dFrom) / (24 * 60 * 60 * 1000));
}

function formatDayMonth(iso: string): string {
	const parsed = parseISODate(iso);
	if (!parsed) return iso;
	const dd = String(parsed.day).padStart(2, "0");
	const mm = String(parsed.month).padStart(2, "0");
	return `${dd}/${mm}`;
}

/**
 * Định dạng hạn nộp trên header trang làm bài thi/bài tập (#587).
 * Trả về rỗng nếu không có hạn (bài tự luyện, bài không đặt hạn, hoặc dữ liệu không hợp lệ).
 * Khi có `dueAt` hợp lệ (ISO datetime): trả về "Hạn: HH:mm dd/mm" (theo giờ VN).
 * Khi chỉ có `due` (ISO yyyy-mm-dd): trả về "Hạn: dd/mm".
 */
export function formatQuizDueText(input: {
	due?: string | null;
	dueAt?: string | null;
}): string {
	const deadline = evaluateAssignmentDeadline({
		due: input.due ?? "",
		dueAt: input.dueAt,
	});
	if (deadline.hasDueAt && deadline.dueAtMs !== null) {
		const parsed = parseISODate(deadline.dueDateISO);
		if (!parsed) return "";
		const time = formatVietnamTimeHHMM(deadline.dueAtMs);
		const date = formatDayMonth(deadline.dueDateISO);
		return `Hạn: ${time} ${date}`;
	}
	if (deadline.dueDateISO) {
		const parsed = parseISODate(deadline.dueDateISO);
		if (!parsed) return "";
		return `Hạn: ${formatDayMonth(deadline.dueDateISO)}`;
	}
	return "";
}

export function deriveAssignmentStatus(
	assignment: StudentAssignment,
	todayISO?: string,
	nowMs: number = Date.now(),
): DerivedAssignmentStatus {
	const resolvedTodayISO = todayISO ?? vietnamTodayISO(new Date(nowMs));
	const bandScore = calculateIeltsBand(assignment.scores);
	const deadline = evaluateAssignmentDeadline({
		due: assignment.due,
		dueAt: assignment.dueAt,
		submittedAt: assignment.submittedAt,
		todayISO: resolvedTodayISO,
		nowMs,
		legacyDateLate: false,
	});
	const { hasDueAt, dueAtMs, dueDateISO, isLate, isOverdue } = deadline;
	const dueLabelBase =
		hasDueAt && dueAtMs !== null
			? `${formatVietnamTimeHHMM(dueAtMs)} ${formatDayMonth(dueDateISO)}`
			: dueDateISO
				? formatDayMonth(dueDateISO)
				: "";
	// Graded takes precedence if scores exist
	if (bandScore != null) {
		return {
			status: "graded",
			statusLabel: isLate
				? `Điểm: ${bandScore} · Nộp trễ`
				: `Điểm: ${bandScore}`,
			badgeClass: "bg-success-soft text-success",
			dueText: dueLabelBase ? `Hạn: ${dueLabelBase}` : "",
			bandScore,
			sortOrder: 4,
			isLate,
		};
	}

	// TOS-30 #478: giáo viên đã "Chốt trả bài" (graded_at có, scores chưa
	// đủ band) — tuyệt đối KHÔNG rơi vào nhãn chờ chấm nữa.
	if (assignment.gradedAt) {
		return {
			status: "graded",
			statusLabel: isLate ? "Đã chấm · Nộp trễ" : "Đã chấm",
			badgeClass: "bg-success-soft text-success",
			dueText: dueLabelBase ? `Hạn: ${dueLabelBase}` : "",
			bandScore: null,
			sortOrder: 4,
			isLate,
		};
	}

	// Submitted
	if (assignment.submittedAt) {
		// TOS-30 #478: chỉ Writing/Speaking chờ giáo viên chấm tay — bài tự
		// chấm (Reading/Listening) đã có điểm ngay khi nộp, giữ "Đã nộp".
		const needsTeacherGrading = hasGradableTask({
			skill: assignment.skill ?? "",
			hasWriting: assignment.hasWriting,
		});
		return {
			status: "submitted",
			statusLabel: isLate
				? needsTeacherGrading
					? "Đã nộp trễ — Đang chờ giáo viên chấm"
					: "Đã nộp · Trễ hạn"
				: needsTeacherGrading
					? "Đã nộp — Đang chờ giáo viên chấm"
					: "Đã nộp",
			badgeClass: isLate
				? "bg-warn-soft text-warn"
				: "bg-success-soft text-success",
			dueText: dueLabelBase ? `Hạn: ${dueLabelBase}` : "",
			bandScore: null,
			sortOrder: 3,
			isLate,
		};
	}

	// Not submitted — evaluate dueAt first when present (#526)
	if (hasDueAt) {
		const diff = dueDateISO ? daysDiff(resolvedTodayISO, dueDateISO) : 0;
		if (isOverdue) {
			const suffix =
				diff != null && diff < 0 ? `quá ${Math.abs(diff)} ngày` : "quá hạn";
			return {
				status: "overdue",
				statusLabel: "Quá hạn",
				badgeClass: "bg-primary font-medium text-primary-foreground",
				dueText: `Hạn: ${dueLabelBase} · ${suffix}`,
				bandScore: null,
				sortOrder: 0,
				isLate: false,
			};
		}
		if (diff != null && diff <= 3) {
			const relativeMsg = diff <= 0 ? "hôm nay" : `còn ${diff} ngày`;
			return {
				status: "due-soon",
				statusLabel: "Sắp đến hạn",
				badgeClass: "border border-dashed border-border text-muted-foreground",
				dueText: `Hạn: ${dueLabelBase} · ${relativeMsg}`,
				bandScore: null,
				sortOrder: 1,
				isLate: false,
			};
		}
		return {
			status: "not-submitted",
			statusLabel: "Chưa nộp",
			badgeClass: "bg-muted text-muted-foreground",
			dueText:
				diff != null
					? `Hạn: ${dueLabelBase} · còn ${diff} ngày`
					: `Hạn: ${dueLabelBase}`,
			bandScore: null,
			sortOrder: 2,
			isLate: false,
		};
	}

	// Not submitted — evaluate due date
	if (!assignment.due) {
		return {
			status: "not-submitted",
			statusLabel: "Chưa nộp",
			badgeClass: "bg-muted text-muted-foreground",
			dueText: "Không có hạn",
			bandScore: null,
			sortOrder: 2,
		};
	}

	const diff = daysDiff(resolvedTodayISO, assignment.due);
	if (diff == null) {
		// Due is free-text / unparseable -> default to not-submitted, NEVER overdue
		return {
			status: "not-submitted",
			statusLabel: "Chưa nộp",
			badgeClass: "bg-muted text-muted-foreground",
			dueText: assignment.due,
			bandScore: null,
			sortOrder: 2,
		};
	}

	const dueFormatted = formatDayMonth(assignment.due);

	if (diff < 0) {
		const overdueDays = Math.abs(diff);
		return {
			status: "overdue",
			statusLabel: "Quá hạn",
			badgeClass: "bg-primary font-medium text-primary-foreground",
			dueText: `Hạn: ${dueFormatted} · quá ${overdueDays} ngày`,
			bandScore: null,
			sortOrder: 0, // Overdue first
		};
	}

	if (diff <= 3) {
		const relativeMsg = diff === 0 ? "hôm nay" : `còn ${diff} ngày`;
		return {
			status: "due-soon",
			statusLabel: "Sắp đến hạn",
			badgeClass: "border border-dashed border-border text-muted-foreground",
			dueText: `Hạn: ${dueFormatted} · ${relativeMsg}`,
			bandScore: null,
			sortOrder: 1,
		};
	}

	return {
		status: "not-submitted",
		statusLabel: "Chưa nộp",
		badgeClass: "bg-muted text-muted-foreground",
		dueText: `Hạn: ${dueFormatted} · còn ${diff} ngày`,
		bandScore: null,
		sortOrder: 2,
	};
}
