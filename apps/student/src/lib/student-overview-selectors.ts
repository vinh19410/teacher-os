import type {
	DailyStudyHourOption,
	StudentAssignment,
	StudentClass,
	StudentInvoiceItem,
	StudentMe,
	StudentScheduleLesson,
} from "@teacher-os/api/contracts";
import {
	evaluateAssignmentDeadline,
	formatVietnamTimeHHMM,
	vietnamDateKeyOf,
	vietnamDateTimeMs,
	vietnamSessionEndMs,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import {
	evaluateZoomJoinWindow,
	ZOOM_EARLY_JOIN_MINUTES,
} from "@teacher-os/api/zoom-window";
import {
	EXAM_LABELS,
	EXAM_SCALE_LABELS,
	getCurrentLevelLabel,
	HOUR_LABELS,
	toStoredExamInterest,
} from "@/components/onboarding/onboarding-steps";
import {
	calculateIeltsBand,
	type DerivedAssignmentStatus,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";
import { VI_DAY_NAMES } from "@/lib/vietnam-display-date";

const STRICT_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STRICT_TIME_HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NON_IELTS_SCALE_RE = /\b(toeic|cefr|a1|a2|b1|b2|c1|c2)\b/i;
const IELTS_BAND_RE =
	/^(?:(?:band|ielts)\s*)?(\d(?:\.\d)?)(\+)?(?:\s*(?:ielts|band))?$/i;

const IELTS_SCALE_MIN = 4;
const IELTS_SCALE_MAX = 9;

const IELTS_LEVEL_RANGES: Record<string, readonly [number, number] | null> = {
	beginner: null,
	basic: [4.0, 4.5],
	intermediate: [4.5, 5.5],
	"upper-intermediate": [6.0, 6.5],
	advanced: [7.0, 9.0],
	unsure: null,
};

const SKILL_LABELS: Record<string, string> = {
	reading: "Reading",
	listening: "Listening",
	writing: "Writing",
	speaking: "Speaking",
	grammar: "Grammar",
	vocab: "Từ vựng",
	vocabulary: "Từ vựng",
};

function fmtVnd(amount: number): string {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

function diffDaysISO(fromISO: string, toISO: string): number | null {
	if (!STRICT_ISO_DATE_RE.test(fromISO) || !STRICT_ISO_DATE_RE.test(toISO)) {
		return null;
	}
	const fromMs = Date.parse(`${fromISO}T00:00:00Z`);
	const toMs = Date.parse(`${toISO}T00:00:00Z`);
	if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
	return Math.round((toMs - fromMs) / 86_400_000);
}

function formatDayMonthShort(iso: string): string {
	if (!STRICT_ISO_DATE_RE.test(iso)) return iso;
	const [, mm, dd] = iso.split("-");
	return `${dd}/${mm}`;
}

function formatRelativeDayLabel(dateISO: string, todayISO: string): string {
	const diff = diffDaysISO(todayISO, dateISO);
	if (diff === 0) return "Hôm nay";
	if (diff === 1) return "Ngày mai";
	if (diff === -1) return "Hôm qua";
	return formatDayMonthShort(dateISO);
}

/**
 * Cộng thời lượng (phút) vào giờ `HH:mm` hợp lệ, trả về `HH:mm` modulo 24h
 * hoặc `null` nếu input sai định dạng (không bao giờ trả `"NaN:NaN"`).
 */
export function formatSessionEndTime(
	time: string,
	dur?: number | null,
): string | null {
	const match = STRICT_TIME_HHMM_RE.exec(time.trim());
	if (!match || typeof dur !== "number" || !Number.isFinite(dur) || dur <= 0) {
		return null;
	}
	const hh = Number.parseInt(match[1] ?? "", 10);
	const mm = Number.parseInt(match[2] ?? "", 10);
	const total = (((hh * 60 + mm + Math.round(dur)) % 1440) + 1440) % 1440;
	const endH = Math.floor(total / 60);
	const endM = total % 60;
	return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

/** Định dạng ngày Việt Nam cho kicker trang chủ: `"Thứ Năm, 26 tháng 11"`. */
export function formatVietnamLongDate(nowMs: number): string {
	if (!Number.isFinite(nowMs)) return "";
	const iso = vietnamDateKeyOf(new Date(nowMs));
	if (!STRICT_ISO_DATE_RE.test(iso)) return "";
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return "";
	const weekday = VI_DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
	return weekday ? `${weekday}, ${d} tháng ${m}` : "";
}

/** Giờ hiện tại theo múi giờ Việt Nam (`HH:mm`), trả chuỗi rỗng nếu `nowMs` bẩn. */
export function vietnamClockHHMM(nowMs: number): string {
	if (!Number.isFinite(nowMs)) return "";
	return formatVietnamTimeHHMM(nowMs);
}

/** Định dạng khoảng thời gian đếm ngược tới giờ học (`15 phút`, `1 giờ`, `2 giờ 5 phút`). */
export function formatMinutesUntilStart(minutes: number): string {
	const clamped = Math.max(1, Math.round(minutes));
	if (clamped < 60) return `${clamped} phút`;
	const hours = Math.floor(clamped / 60);
	const rem = clamped % 60;
	return rem > 0 ? `${hours} giờ ${rem} phút` : `${hours} giờ`;
}

/** Nhãn kỹ năng chuẩn hóa cho metadata bài tập (trả `null` khi vắng/không xác định). */
export function formatAssignmentSkillLabel(
	skill?: string | null,
): string | null {
	const key = skill?.trim().toLowerCase() ?? "";
	if (!key) return null;
	return SKILL_LABELS[key] ?? null;
}

// --- Next Task Hero --------------------------------------------------------

export interface NextTaskRemaining {
	label: string;
	tone: "destructive" | "warn" | "neutral";
}

export interface NextTaskItem {
	assignment: StudentAssignment;
	derived: DerivedAssignmentStatus;
	skillLabel: string | null;
	dueLabel: string;
	queueDueLabel: string;
	remaining: NextTaskRemaining | null;
}

export interface NextTaskHeroData {
	primary: NextTaskItem | null;
	queue: NextTaskItem[];
	totalPending: number;
	overdueCount: number;
	dueSoonCount: number;
}

export function selectNextTaskHero(
	assignments: readonly StudentAssignment[],
	todayISO: string,
	nowMs: number,
): NextTaskHeroData {
	let overdueCount = 0;
	let dueSoonCount = 0;

	const pendingCandidates: Array<{
		item: NextTaskItem;
		sortOrder: number;
		effectiveDueMs: number;
	}> = [];

	for (const a of assignments) {
		const derived = deriveAssignmentStatus(a, todayISO, nowMs);
		if (derived.status === "overdue") overdueCount += 1;
		else if (derived.status === "due-soon") dueSoonCount += 1;

		// Chỉ đưa bài `class_assignment` chưa nộp/chưa chấm vào hero CTA vì chỉ nguồn
		// này có route `/learn/quizzes/$assignmentId`.
		if (a.source !== "class_assignment") continue;
		if (a.submittedAt || a.gradedAt || calculateIeltsBand(a.scores) != null) {
			continue;
		}

		const deadline = evaluateAssignmentDeadline({
			due: a.due,
			dueAt: a.dueAt,
			submittedAt: a.submittedAt,
			todayISO,
			nowMs,
			legacyDateLate: false,
		});

		// Sort key nội bộ: không bao giờ hiển thị "23:59" khi dueAt rỗng.
		const dateFallbackMs = STRICT_ISO_DATE_RE.test(deadline.dueDateISO)
			? vietnamDateTimeMs(deadline.dueDateISO, "23:59")
			: Number.NaN;
		const effectiveDueMs =
			deadline.dueAtMs ??
			(Number.isFinite(dateFallbackMs)
				? dateFallbackMs
				: Number.POSITIVE_INFINITY);

		let dueLabel = "Không có hạn";
		let queueDueLabel = "Không hạn";
		if (deadline.hasDueAt && deadline.dueAtMs != null) {
			const dayText = formatRelativeDayLabel(deadline.dueDateISO, todayISO);
			const timeText = formatVietnamTimeHHMM(deadline.dueAtMs);
			dueLabel = `Hạn ${dayText}, ${timeText}`;
			queueDueLabel = `${dayText}, ${timeText}`;
		} else if (STRICT_ISO_DATE_RE.test(deadline.dueDateISO)) {
			const dayText = formatRelativeDayLabel(deadline.dueDateISO, todayISO);
			dueLabel = `Hạn ${dayText}`;
			queueDueLabel = dayText;
		} else if (a.due.trim()) {
			dueLabel = `Hạn ${a.due.trim()}`;
			queueDueLabel = a.due.trim();
		}

		let remaining: NextTaskRemaining | null = null;
		if (derived.status === "overdue") {
			remaining = { label: "Đã quá hạn", tone: "destructive" };
		} else if (deadline.hasDueAt && deadline.dueAtMs != null) {
			const ms = deadline.dueAtMs - nowMs;
			if (ms <= 0) {
				remaining = { label: "Đã quá hạn", tone: "destructive" };
			} else if (ms < 3_600_000) {
				remaining = {
					label: `còn ${Math.max(1, Math.floor(ms / 60_000))} phút`,
					tone: "warn",
				};
			} else if (ms < 24 * 3_600_000) {
				remaining = {
					label: `còn ${Math.floor(ms / 3_600_000)} giờ`,
					tone: "warn",
				};
			} else {
				const calendarDays = diffDaysISO(todayISO, deadline.dueDateISO);
				const days =
					calendarDays != null && calendarDays > 0
						? calendarDays
						: Math.max(1, Math.floor(ms / 86_400_000));
				remaining = {
					label: `còn ${days} ngày`,
					tone: derived.status === "due-soon" ? "warn" : "neutral",
				};
			}
		} else if (STRICT_ISO_DATE_RE.test(deadline.dueDateISO)) {
			const diff = diffDaysISO(todayISO, deadline.dueDateISO);
			if (diff === 0) {
				remaining = { label: "hôm nay", tone: "warn" };
			} else if (diff != null && diff > 0) {
				remaining = {
					label: `còn ${diff} ngày`,
					tone: diff <= 3 ? "warn" : "neutral",
				};
			}
		}

		pendingCandidates.push({
			item: {
				assignment: a,
				derived,
				skillLabel: formatAssignmentSkillLabel(a.skill),
				dueLabel,
				queueDueLabel,
				remaining,
			},
			sortOrder: derived.sortOrder,
			effectiveDueMs,
		});
	}

	pendingCandidates.sort(
		(x, y) =>
			x.sortOrder - y.sortOrder ||
			x.effectiveDueMs - y.effectiveDueMs ||
			x.item.assignment.id.localeCompare(y.item.assignment.id),
	);

	const ordered = pendingCandidates.map((c) => c.item);
	return {
		primary: ordered[0] ?? null,
		queue: ordered.slice(1, 3),
		totalPending: ordered.length,
		overdueCount,
		dueSoonCount,
	};
}

// --- Today Schedule --------------------------------------------------------

export type TodaySessionState = "ended" | "live" | "open" | "later";

export interface TodayScheduleItem {
	id: string;
	classId: string;
	className: string;
	date: string;
	time: string;
	endTime: string | null;
	dur?: number;
	subtitle: string;
	hasZoom: boolean;
	state: TodaySessionState;
	minutesUntilStart: number | null;
	relativeText: string | null;
	openAtLabel: string | null;
}

export interface UpcomingFallbackItem {
	id: string;
	classId: string;
	className: string;
	date: string;
	time: string;
	dur?: number;
	subtitle: string;
	hasZoom: boolean;
}

export interface TodayScheduleData {
	todayItems: TodayScheduleItem[];
	remainingCount: number;
	upcomingFallback: UpcomingFallbackItem[];
	isFallback: boolean;
}

function formatOpenAtLabel(openMs: number, todayISO: string): string | null {
	const hhmm = formatVietnamTimeHHMM(openMs);
	if (!hhmm) return null;
	const openDateISO = vietnamDateKeyOf(new Date(openMs));
	if (openDateISO === todayISO) return hhmm;
	return `${hhmm} ${formatDayMonthShort(openDateISO)}`;
}

function classifyTodaySession(input: {
	id: string;
	classId: string;
	className: string;
	date: string;
	time: string;
	dur?: number;
	status: string;
	subtitle: string;
	hasZoom: boolean;
	nowMs: number;
	todayISO: string;
}): TodayScheduleItem {
	const trimmedTime = input.time.trim();
	const validTime = STRICT_TIME_HHMM_RE.test(trimmedTime);
	const validDate = STRICT_ISO_DATE_RE.test(input.date);
	const rawStartMs =
		validTime && validDate
			? vietnamDateTimeMs(input.date, trimmedTime)
			: Number.NaN;
	const startMs = Number.isFinite(rawStartMs) ? rawStartMs : null;

	const validDur =
		typeof input.dur === "number" && Number.isFinite(input.dur) && input.dur > 0
			? input.dur
			: undefined;
	const rawEndMs =
		startMs != null && validDur != null
			? vietnamSessionEndMs(input.date, trimmedTime, validDur)
			: null;
	const endMs = rawEndMs != null && Number.isFinite(rawEndMs) ? rawEndMs : null;

	const zoomWin =
		validDur != null
			? evaluateZoomJoinWindow({
					date: input.date,
					time: trimmedTime,
					dur: validDur,
					nowMs: input.nowMs,
				})
			: null;

	const openMs =
		zoomWin && zoomWin.status !== "invalid"
			? zoomWin.openMs
			: startMs != null
				? startMs - ZOOM_EARLY_JOIN_MINUTES * 60_000
				: null;

	let state: TodaySessionState;
	if (
		input.status === "completed" ||
		input.status === "absent" ||
		(endMs != null && input.nowMs >= endMs)
	) {
		state = "ended";
	} else if (startMs != null && input.nowMs >= startMs) {
		state = "live";
	} else if (
		input.hasZoom &&
		startMs != null &&
		openMs != null &&
		input.nowMs >= openMs &&
		input.nowMs < startMs
	) {
		state = "open";
	} else {
		state = "later";
	}

	const minutesUntilStart =
		startMs != null && startMs > input.nowMs
			? Math.max(1, Math.round((startMs - input.nowMs) / 60_000))
			: null;

	return {
		id: input.id,
		classId: input.classId,
		className: input.className,
		date: input.date,
		time: trimmedTime,
		endTime: formatSessionEndTime(trimmedTime, validDur),
		dur: validDur,
		subtitle: input.subtitle,
		hasZoom: input.hasZoom,
		state,
		minutesUntilStart,
		relativeText:
			minutesUntilStart != null
				? formatMinutesUntilStart(minutesUntilStart)
				: null,
		openAtLabel:
			openMs != null ? formatOpenAtLabel(openMs, input.todayISO) : null,
	};
}

export function selectTodaySchedule(input: {
	classes: readonly StudentClass[];
	lessons: readonly StudentScheduleLesson[] | null;
	nowMs: number;
}): TodayScheduleData {
	const todayISO = vietnamTodayISO(new Date(input.nowMs));

	// Allowlist fail-closed: chỉ nhận lớp đang hoạt động và học viên đã kích hoạt.
	const activeClassById = new Map<string, StudentClass>();
	for (const cls of input.classes) {
		if (cls.status === "active" && cls.enrollmentStatus === "active") {
			activeClassById.set(cls.id, cls);
		}
	}

	if (input.lessons !== null) {
		const todayLessons = input.lessons
			.filter(
				(lesson) =>
					lesson.date === todayISO &&
					activeClassById.has(lesson.classId) &&
					lesson.status !== "cancelled" &&
					lesson.status !== "holiday",
			)
			.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));

		const todayItems = todayLessons.map((lesson) => {
			const cls = activeClassById.get(lesson.classId);
			const subtitle = lesson.topic.trim() || cls?.mode?.trim() || "Buổi học";
			return classifyTodaySession({
				id: lesson.id,
				classId: lesson.classId,
				className: lesson.className || cls?.name || "",
				date: lesson.date ?? todayISO,
				time: lesson.time,
				dur: lesson.dur,
				status: lesson.status,
				subtitle,
				hasZoom: Boolean(lesson.hasZoom ?? lesson.joinUrl),
				nowMs: input.nowMs,
				todayISO,
			});
		});

		const remainingCount = todayItems.filter(
			(item) => item.state !== "ended",
		).length;

		let upcomingFallback: UpcomingFallbackItem[] = [];
		if (todayItems.length === 0) {
			upcomingFallback = input.lessons
				.filter((lesson) => {
					if (
						!lesson.date ||
						!STRICT_ISO_DATE_RE.test(lesson.date) ||
						lesson.date < todayISO ||
						!activeClassById.has(lesson.classId) ||
						lesson.status !== "upcoming"
					) {
						return false;
					}
					const endMs =
						lesson.dur > 0
							? vietnamSessionEndMs(lesson.date, lesson.time, lesson.dur)
							: null;
					return endMs == null || endMs > input.nowMs;
				})
				.sort(
					(a, b) =>
						(a.date ?? "").localeCompare(b.date ?? "") ||
						a.time.localeCompare(b.time) ||
						a.id.localeCompare(b.id),
				)
				.slice(0, 2)
				.map((lesson) => {
					const cls = activeClassById.get(lesson.classId);
					return {
						id: lesson.id,
						classId: lesson.classId,
						className: lesson.className || cls?.name || "",
						date: lesson.date ?? todayISO,
						time: lesson.time,
						dur: lesson.dur > 0 ? lesson.dur : undefined,
						subtitle: lesson.topic.trim() || cls?.mode?.trim() || "Buổi học",
						hasZoom: Boolean(lesson.hasZoom ?? lesson.joinUrl),
					};
				});
		}

		return {
			todayItems,
			remainingCount,
			upcomingFallback,
			isFallback: false,
		};
	}

	// Nhánh lỗi tải `/api/student/schedule`: fallback nhẹ sang `overview.classes[].nextSession`.
	const todayItems: TodayScheduleItem[] = [];
	const upcomingCandidates: UpcomingFallbackItem[] = [];

	for (const cls of activeClassById.values()) {
		const next = cls.nextSession;
		if (!next || !STRICT_ISO_DATE_RE.test(next.date) || next.date < todayISO) {
			continue;
		}
		const validDur =
			typeof next.dur === "number" && Number.isFinite(next.dur) && next.dur > 0
				? next.dur
				: undefined;
		const endMs =
			validDur != null
				? vietnamSessionEndMs(next.date, next.time, validDur)
				: null;
		if (endMs != null && endMs <= input.nowMs) {
			continue;
		}
		const subtitle = next.topic.trim() || cls.mode.trim() || "Buổi học";
		const hasZoom = Boolean(next.hasZoom ?? next.joinUrl);

		if (next.date === todayISO) {
			todayItems.push(
				classifyTodaySession({
					id: `${cls.id}:${next.date}:${next.time}`,
					classId: cls.id,
					className: cls.name,
					date: next.date,
					time: next.time,
					dur: validDur,
					status: "upcoming",
					subtitle,
					hasZoom,
					nowMs: input.nowMs,
					todayISO,
				}),
			);
		} else {
			upcomingCandidates.push({
				id: `${cls.id}:${next.date}:${next.time}`,
				classId: cls.id,
				className: cls.name,
				date: next.date,
				time: next.time,
				dur: validDur,
				subtitle,
				hasZoom,
			});
		}
	}

	todayItems.sort(
		(a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
	);
	const remainingCount = todayItems.filter(
		(item) => item.state !== "ended",
	).length;
	const upcomingFallback =
		todayItems.length === 0
			? upcomingCandidates
					.sort(
						(a, b) =>
							a.date.localeCompare(b.date) ||
							a.time.localeCompare(b.time) ||
							a.id.localeCompare(b.id),
					)
					.slice(0, 2)
			: [];

	return {
		todayItems,
		remainingCount,
		upcomingFallback,
		isFallback: true,
	};
}

// --- Goal Progress ---------------------------------------------------------

export interface ParsedIeltsBand {
	value: number;
	isPlus: boolean;
	display: string;
}

export interface GoalStatItem {
	label: string;
	value: string;
	hint: string;
	isNumeric: boolean;
}

export interface IeltsBandScale {
	min: number;
	max: number;
	currentPointPct: number | null;
	currentRangePct: readonly [number, number] | null;
	targetPointPct: number;
	gapLeftPct: number;
	gapWidthPct: number;
	ariaLabel: string;
	hasExactCurrent: boolean;
	hasRangeCurrent: boolean;
}

export interface StudentGoalSummary {
	hasGoalData: boolean;
	examLabel: string;
	stats: GoalStatItem[];
	ieltsScale: IeltsBandScale | null;
}

/**
 * Parse band IELTS hợp lệ trong `[0.0, 9.0]` bước `0.5` (`"6.5"`, `"8.0+"`,
 * `"Band 5.5"`, `"6.5 IELTS"`, `"IELTS 7.0"`). Từ chối mọi chuỗi TOEIC / CEFR / ngoài thang.
 */
export function parseIeltsBand(
	raw: string | null | undefined,
): ParsedIeltsBand | null {
	const trimmed = raw?.trim() ?? "";
	if (!trimmed || NON_IELTS_SCALE_RE.test(trimmed)) return null;
	const match = IELTS_BAND_RE.exec(trimmed);
	if (!match) return null;
	const value = Number.parseFloat(match[1] ?? "");
	if (!Number.isFinite(value) || value < 0 || value > 9) return null;
	if (Math.round(value * 2) !== value * 2) return null;
	const isPlus = Boolean(match[2]);
	return {
		value,
		isPlus,
		display: `${value.toFixed(1)}${isPlus ? "+" : ""}`,
	};
}

function clampIeltsPct(band: number): number {
	const pct =
		((band - IELTS_SCALE_MIN) / (IELTS_SCALE_MAX - IELTS_SCALE_MIN)) * 100;
	return Math.max(0, Math.min(100, pct));
}

export function deriveStudentGoalSummary(input: {
	student: Partial<
		Pick<
			StudentMe["student"],
			| "examInterest"
			| "currentLevel"
			| "targetScore"
			| "entryScore"
			| "dailyStudyHours"
		>
	>;
	activeClassCount: number;
}): StudentGoalSummary {
	const { student, activeClassCount } = input;
	const examKey = toStoredExamInterest(student.examInterest);
	const examLabel = EXAM_LABELS[examKey];
	const scaleLabel = EXAM_SCALE_LABELS[examKey];

	const entryScoreTrimmed = student.entryScore?.trim() ?? "";
	const targetScoreTrimmed = student.targetScore?.trim() ?? "";
	const hasCurrentLevel = Boolean(
		student.currentLevel && student.currentLevel !== "unsure",
	);
	const dailyHoursKey = student.dailyStudyHours as
		| DailyStudyHourOption
		| null
		| undefined;
	const dailyHoursLabel =
		dailyHoursKey && Object.hasOwn(HOUR_LABELS, dailyHoursKey)
			? HOUR_LABELS[dailyHoursKey]
			: null;

	const hasGoalData = Boolean(
		entryScoreTrimmed ||
			hasCurrentLevel ||
			targetScoreTrimmed ||
			dailyHoursLabel,
	);

	if (!hasGoalData) {
		return {
			hasGoalData: false,
			examLabel,
			stats: [],
			ieltsScale: null,
		};
	}

	const entryBand =
		examKey === "ielts" ? parseIeltsBand(entryScoreTrimmed) : null;
	const targetBand =
		examKey === "ielts" ? parseIeltsBand(targetScoreTrimmed) : null;
	const levelRange =
		examKey === "ielts" && !entryScoreTrimmed && student.currentLevel
			? (IELTS_LEVEL_RANGES[student.currentLevel] ?? null)
			: null;

	// Slot 1 — Trình độ hiện tại
	let currentStat: GoalStatItem;
	if (entryScoreTrimmed) {
		currentStat = {
			label: "Trình độ hiện tại",
			value: entryBand ? entryBand.display : entryScoreTrimmed,
			hint: "Điểm đầu vào đã ghi nhận",
			isNumeric: Boolean(entryBand),
		};
	} else if (hasCurrentLevel) {
		currentStat = {
			label: "Trình độ hiện tại",
			value: getCurrentLevelLabel(student.currentLevel, student.examInterest),
			hint: `${scaleLabel} · tự đánh giá`,
			isNumeric: false,
		};
	} else {
		currentStat = {
			label: "Trình độ hiện tại",
			value: "Chưa đánh giá",
			hint: "Làm bài đầu vào để xác định",
			isNumeric: false,
		};
	}

	// Slot 2 — Mục tiêu
	const targetStat: GoalStatItem = {
		label: examKey === "ielts" ? "Band mục tiêu" : "Mục tiêu",
		value: targetScoreTrimmed || "Chưa đặt",
		hint: targetScoreTrimmed
			? `${scaleLabel} · chọn khi đăng ký`
			: "Chưa chọn mục tiêu",
		isNumeric: Boolean(targetBand),
	};

	// Slot 3 — Khoảng cách band IELTS (khi quy đổi trung thực) hoặc Thời gian tự học
	let thirdStat: GoalStatItem;
	if (examKey === "ielts" && targetBand != null && entryBand != null) {
		const diff = targetBand.value - entryBand.value;
		if (diff <= 0) {
			thirdStat = {
				label: "Cần tăng thêm",
				value: "Đã đạt",
				hint: "tiếp tục duy trì",
				isNumeric: false,
			};
		} else {
			thirdStat = {
				label: "Cần tăng thêm",
				value: `+${diff.toFixed(1)}${targetBand.isPlus ? "+" : ""}`,
				hint: "band",
				isNumeric: true,
			};
		}
	} else if (
		examKey === "ielts" &&
		targetBand != null &&
		!entryScoreTrimmed &&
		levelRange != null
	) {
		const minGap = targetBand.value - levelRange[1];
		const maxGap = targetBand.value - levelRange[0];
		if (maxGap <= 0) {
			thirdStat = {
				label: "Cần tăng thêm",
				value: "Đã đạt",
				hint: "so với mục tiêu",
				isNumeric: false,
			};
		} else if (minGap <= 0) {
			thirdStat = {
				label: "Cần tăng thêm",
				value: `tối đa +${maxGap.toFixed(1)}`,
				hint: "band ước tính",
				isNumeric: false,
			};
		} else {
			thirdStat = {
				label: "Cần tăng thêm",
				value: `+${minGap.toFixed(1)} – ${maxGap.toFixed(1)}`,
				hint: "band ước tính",
				isNumeric: false,
			};
		}
	} else {
		thirdStat = {
			label: "Thời gian tự học",
			value: dailyHoursLabel ?? "Chưa đặt",
			hint: dailyHoursLabel ? "Mục tiêu mỗi ngày" : "Đặt nhịp học đều đặn",
			isNumeric: false,
		};
	}

	// Slot 4 — Lớp đang học
	const fourthStat: GoalStatItem = {
		label: "Lớp đang học",
		value: String(activeClassCount),
		hint: "Lớp đã kích hoạt",
		isNumeric: true,
	};

	let ieltsScale: IeltsBandScale | null = null;
	if (examKey === "ielts" && targetBand != null) {
		const targetPointPct = clampIeltsPct(targetBand.value);
		if (entryBand != null) {
			const currentPointPct = clampIeltsPct(entryBand.value);
			ieltsScale = {
				min: IELTS_SCALE_MIN,
				max: IELTS_SCALE_MAX,
				currentPointPct,
				currentRangePct: null,
				targetPointPct,
				gapLeftPct: currentPointPct,
				gapWidthPct: Math.max(0, targetPointPct - currentPointPct),
				ariaLabel: `Thang IELTS từ ${IELTS_SCALE_MIN} đến ${IELTS_SCALE_MAX}: hiện tại ${entryBand.display}, mục tiêu ${targetBand.display}`,
				hasExactCurrent: true,
				hasRangeCurrent: false,
			};
		} else if (!entryScoreTrimmed && levelRange != null) {
			const rMin = clampIeltsPct(levelRange[0]);
			const rMax = clampIeltsPct(levelRange[1]);
			ieltsScale = {
				min: IELTS_SCALE_MIN,
				max: IELTS_SCALE_MAX,
				currentPointPct: null,
				currentRangePct: [rMin, rMax],
				targetPointPct,
				gapLeftPct: rMax,
				gapWidthPct: Math.max(0, targetPointPct - rMax),
				ariaLabel: `Thang IELTS từ ${IELTS_SCALE_MIN} đến ${IELTS_SCALE_MAX}: vùng tự đánh giá ${currentStat.value}, mục tiêu ${targetBand.display}`,
				hasExactCurrent: false,
				hasRangeCurrent: true,
			};
		} else {
			ieltsScale = {
				min: IELTS_SCALE_MIN,
				max: IELTS_SCALE_MAX,
				currentPointPct: null,
				currentRangePct: null,
				targetPointPct,
				gapLeftPct: 0,
				gapWidthPct: 0,
				ariaLabel: `Thang IELTS từ ${IELTS_SCALE_MIN} đến ${IELTS_SCALE_MAX}: mục tiêu ${targetBand.display}`,
				hasExactCurrent: false,
				hasRangeCurrent: false,
			};
		}
	}

	return {
		hasGoalData: true,
		examLabel,
		stats: [currentStat, targetStat, thirdStat, fourthStat],
		ieltsScale,
	};
}

// --- Tuition Summary -------------------------------------------------------

export interface StudentTuitionSummary {
	primaryInvoice: StudentInvoiceItem;
	totalPaid: number;
	totalDue: number;
	primaryInvoiceDue: number;
	unsettledCount: number;
	totalInvoices: number;
	subtitle: string;
	primaryLinkAriaLabel: string;
}

function isInvoiceSettled(inv: StudentInvoiceItem): boolean {
	return inv.status === "paid" || inv.amountDue <= 0;
}

export function normalizeInvoiceTypeLabel(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed || /^tuition$/i.test(trimmed)) return "Học phí";
	return trimmed;
}

export function selectStudentTuitionSummary(
	invoices: readonly StudentInvoiceItem[],
): StudentTuitionSummary | null {
	if (invoices.length === 0) return null;

	let totalPaid = 0;
	let totalDue = 0;
	const unsettled: StudentInvoiceItem[] = [];

	for (const inv of invoices) {
		if (isInvoiceSettled(inv)) {
			totalPaid += inv.amount;
		} else {
			totalPaid += inv.paidAmount;
			totalDue += inv.amountDue;
			unsettled.push(inv);
		}
	}

	const primaryInvoice = unsettled[0] ?? invoices[0];
	if (!primaryInvoice) return null;

	const primaryInvoiceDue = isInvoiceSettled(primaryInvoice)
		? 0
		: primaryInvoice.amountDue;
	const primaryType = normalizeInvoiceTypeLabel(primaryInvoice.type);
	const primaryLinkAriaLabel = /Học phí/.test(primaryType)
		? `Xem hóa đơn ${primaryType}`
		: `Xem hóa đơn Học phí — ${primaryType}`;

	let subtitle: string;
	if (unsettled.length === 0) {
		subtitle = `${primaryType} · Đã hoàn tất ${invoices.length} hóa đơn`;
	} else if (unsettled.length === 1) {
		subtitle =
			primaryInvoice.paidAmount > 0
				? `${primaryType} · Đã đóng ${fmtVnd(primaryInvoice.paidAmount)} / ${fmtVnd(primaryInvoice.amount)}`
				: primaryType;
	} else {
		subtitle = `${unsettled.length} hóa đơn chưa đóng · hóa đơn gần nhất ${fmtVnd(primaryInvoiceDue)}`;
	}

	return {
		primaryInvoice,
		totalPaid,
		totalDue,
		primaryInvoiceDue,
		unsettledCount: unsettled.length,
		totalInvoices: invoices.length,
		subtitle,
		primaryLinkAriaLabel,
	};
}
