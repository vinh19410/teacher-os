import {
	CLASS_TYPES,
	type ClassType,
	IELTS_SKILLS,
} from "@teacher-os/api/contracts";
import type { StructuredSchedule } from "@teacher-os/api/format-schedule";
import type { ChipMultiOption } from "@/components/ui/chip-multi";
import { addMinutes } from "@/lib/format-schedule";
import { CLASS_TYPE_LABELS, dayNames, type Syllabus } from "@/lib/mock-data";

export const CLASS_TYPE_OPTIONS: ChipMultiOption<ClassType>[] = CLASS_TYPES.map(
	(value) => ({
		value,
		label: CLASS_TYPE_LABELS[value],
	}),
);

export const SKILL_OPTIONS: ChipMultiOption<string>[] = IELTS_SKILLS.map(
	(value) => ({
		value,
		label: value,
	}),
);

export const DAY_OPTIONS: ChipMultiOption<number>[] = dayNames.map(
	(label, value) => ({
		value,
		label,
	}),
);

export const LEVEL_OPTIONS = [
	"Band 5.5",
	"Band 6.0",
	"Band 6.5",
	"Band 7.0",
	"Band 7.5+",
] as const;

export const MODE_OPTIONS = ["Online", "Offline"] as const;

const SESSION_MINUTES = 90;
const DEFAULT_START = "19:00";

export const SESSION_PRESETS = {
	durationMinutes: SESSION_MINUTES,
	defaultStart: DEFAULT_START,
	defaultEnd: addMinutes(DEFAULT_START, SESSION_MINUTES),
	minSessions: 1,
	maxSessions: 52,
} as const;

/** Kỹ năng lớp lấy từ syllabus: thứ tự canonical theo IELTS_SKILLS,
 * tự dedupe và lọc giá trị ngoài enum (phòng thủ dữ liệu cũ). */
export function skillsFromTemplate(
	templateSkills: readonly string[],
): string[] {
	return IELTS_SKILLS.filter((skill) => templateSkills.includes(skill));
}

/** Tổng số buổi lấy từ syllabus: đếm mọi buổi qua mọi module,
 * gồm cả buổi thi (midterm/final). Đếm từ cây modules thay vì
 * totalLessons vì totalLessons có thể stale (chỉ sync khi replace). */
export function sessionsFromTemplate(
	templateModules: Syllabus["modules"] | undefined | null,
): number {
	return (templateModules ?? []).reduce(
		(sum, module) => sum + (module?.lessons?.length ?? 0),
		0,
	);
}

/** Chuẩn hóa days (dedupe + sort tăng dần) khớp logic serialize trên server. */
export function normalizeScheduleInput(schedule: {
	days: number[];
	start: string;
	end: string;
}): StructuredSchedule {
	return {
		days: [...new Set(schedule.days)].sort((a, b) => a - b),
		start: schedule.start,
		end: schedule.end,
	};
}

/** Serialize schedule sang JSON chuẩn để lưu vào `ClassGroup.schedule`. */
export function serializeSchedule(schedule: {
	days: number[];
	start: string;
	end: string;
}): string {
	return JSON.stringify(normalizeScheduleInput(schedule));
}

const ISO_CALENDAR_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Kiểm tra chuỗi ISO `yyyy-mm-dd` hợp lệ trên lịch (chặn `2026-02-30`). */
export function isValidIsoCalendarDate(value: string): boolean {
	if (!ISO_CALENDAR_DATE_REGEX.test(value)) return false;
	const year = Number.parseInt(value.slice(0, 4), 10);
	if (year < 2000 || year > 2100) return false;
	const check = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === value
	);
}

/** Parse tổng số buổi nguyên trong khoảng 1..52; null nếu không hợp lệ. */
export function parseValidSessionsTotal(raw: string): number | null {
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const parsed = Number.parseInt(trimmed, 10);
	if (
		!Number.isInteger(parsed) ||
		parsed < SESSION_PRESETS.minSessions ||
		parsed > SESSION_PRESETS.maxSessions
	) {
		return null;
	}
	return parsed;
}
