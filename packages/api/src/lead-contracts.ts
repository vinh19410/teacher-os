import { z } from "zod";
import { vietnamTodayISO } from "./vietnam-date";

/**
 * Lead intake từ form đăng ký và trang kiểm tra đầu vào trên msmy.io.vn
 * (#506, #534). Lead KHÔNG phải student (D1): chưa có portal identity,
 * lifecycle riêng new → contacted → enrolled | dropped.
 */

export const LEAD_NAME_MIN = 2;
export const LEAD_NAME_MAX = 80;
export const LEAD_EMAIL_MAX = 120;
export const LEAD_NOTE_MAX = 500;
export const LEAD_PLACEMENT_MAX = 300;
export const LEAD_TEACHER_NOTE_MAX = 1000;
export const LEAD_QUERY_MAX = 100;
export const LEAD_PAGE_SIZE = 20;

/** Khóa học theo danh mục Google Form cũ của cô Mỹ (D2) — code ổn định,
 * nhãn đổi thoải mái không phải migrate. */
export const LEAD_COURSES = [
	"ielts-foundation",
	"ielts-first-step",
	"ielts-pre",
	"ielts-advanced",
	"ielts-sw-intensive",
	"ielts-single-skill",
	"comm-1",
	"comm-2",
	"comm-3",
	"comm-4",
	"comm-5",
	"undecided",
] as const;
export type LeadCourse = (typeof LEAD_COURSES)[number];

export const LEAD_COURSE_LABELS: Readonly<Record<LeadCourse, string>> = {
	"ielts-foundation": "IELTS Foundation (0–3.0)",
	"ielts-first-step": "IELTS First Step (3.0–3.5)",
	"ielts-pre": "Pre IELTS (4.0–4.5)",
	"ielts-advanced": "IELTS Advanced (5.0–7.5+)",
	"ielts-sw-intensive": "IELTS Speaking & Writing cấp tốc",
	"ielts-single-skill": "IELTS cấp tốc 1 kỹ năng",
	"comm-1": "Giao tiếp 1",
	"comm-2": "Giao tiếp 2",
	"comm-3": "Giao tiếp 3",
	"comm-4": "Giao tiếp 4",
	"comm-5": "Giao tiếp 5",
	undecided: "Chưa rõ – cần test 1-1",
};

/** Nhóm khóa cho `<optgroup>` web và test drift profile (#506 phase 4/5). */
export const LEAD_COURSE_GROUPS = {
	ielts: {
		label: "IELTS",
		codes: [
			"ielts-foundation",
			"ielts-first-step",
			"ielts-pre",
			"ielts-advanced",
			"ielts-sw-intensive",
			"ielts-single-skill",
		],
	},
	comm: {
		label: "Giao tiếp định hướng IELTS",
		codes: ["comm-1", "comm-2", "comm-3", "comm-4", "comm-5"],
	},
	other: { label: "Khác", codes: ["undecided"] },
} as const satisfies Readonly<
	Record<string, { label: string; codes: readonly LeadCourse[] }>
>;

/** Hình thức lớp (D12) — giữ trường đang có trên trang profile dù Google
 * Form cũ không hỏi. */
export const LEAD_STUDY_MODES = [
	"group-online",
	"private-online",
	"offline-vgp",
] as const;
export type LeadStudyMode = (typeof LEAD_STUDY_MODES)[number];

export const LEAD_STUDY_MODE_LABELS: Readonly<Record<LeadStudyMode, string>> = {
	"group-online": "Bàn tròn 4–6 bạn, Google Meet",
	"private-online": "Kèm 1-1, Google Meet",
	"offline-vgp": "Offline Vinhomes Grand Park",
};

/** Cặp ngày học theo Google Form (MT/TF/WS/SS + linh hoạt). */
export const LEAD_STUDY_DAYS = ["mt", "tf", "ws", "ss", "flexible"] as const;
export type LeadStudyDay = (typeof LEAD_STUDY_DAYS)[number];

export const LEAD_STUDY_DAY_LABELS: Readonly<Record<LeadStudyDay, string>> = {
	mt: "Thứ 2 & Thứ 5",
	tf: "Thứ 3 & Thứ 6",
	ws: "Thứ 4 & Thứ 7",
	ss: "Thứ 7 & Chủ nhật",
	flexible: "Linh hoạt",
};

/** Khung giờ theo Google Form (9:00/13:30/15:45/18:15/20:00 + linh hoạt). */
export const LEAD_TIME_SLOTS = [
	"0900",
	"1330",
	"1545",
	"1815",
	"2000",
	"flexible",
] as const;
export type LeadTimeSlot = (typeof LEAD_TIME_SLOTS)[number];

export const LEAD_TIME_SLOT_LABELS: Readonly<Record<LeadTimeSlot, string>> = {
	"0900": "9:00",
	"1330": "13:30",
	"1545": "15:45",
	"1815": "18:15",
	"2000": "20:00",
	flexible: "Linh hoạt",
};

export const LEAD_STATUSES = [
	"new",
	"contacted",
	"enrolled",
	"dropped",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
	new: "Mới",
	contacted: "Đã liên hệ",
	enrolled: "Đã ghi danh",
	dropped: "Bỏ",
};

/** Nguồn thu nhận lead (#534): form trang chủ (`profile`) hoặc cổng bài test đầu vào (`placement-test`). */
export const LEAD_SOURCES = ["profile", "placement-test"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Mã lỗi chuẩn của routes lead. */
export const LEAD_ERROR_CODES = [
	"LEAD_INTAKE_DISABLED",
	"LEAD_RATE_LIMITED",
	"LEAD_DAILY_CAP",
	"LEAD_ORIGIN_FORBIDDEN",
	"LEAD_INVALID",
	"LEAD_NOT_FOUND",
] as const;
export type LeadErrorCode = (typeof LEAD_ERROR_CODES)[number];

/**
 * Chuẩn hóa SĐT Việt Nam (D3): bỏ ký tự không phải số, tiền tố quốc tế
 * `84` → `0`, phải khớp `^0\d{9}$` (10 số, bắt đầu 0). Trả null khi lệch.
 */
export function normalizeVietnamPhone(raw: string): string | null {
	const digits = raw.replace(/\D+/g, "");
	const local = digits.startsWith("84") ? `0${digits.slice(2)}` : digits;
	return /^0\d{9}$/.test(local) ? local : null;
}

/** yyyy-mm-dd hợp lệ thật (2026-02-30 bị từ chối) — cùng rule org-event. */
function isCalendarDate(raw: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
	const parsed = new Date(`${raw}T00:00:00Z`);
	return (
		!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw
	);
}

/** Ngày sinh lead: optional, năm trong [1940, năm hiện tại theo giờ VN]. */
const birthDateSchema = z
	.string()
	.refine(isCalendarDate, { message: "Ngày sinh phải là yyyy-mm-dd hợp lệ" })
	.refine(
		(raw) => {
			const year = Number.parseInt(raw.slice(0, 4), 10);
			const currentYear = Number.parseInt(vietnamTodayISO().slice(0, 4), 10);
			return year >= 1940 && year <= currentYear;
		},
		{ message: "Năm sinh phải trong khoảng 1940 đến năm hiện tại" },
	);

/** Email lead: optional; chuỗi rỗng (client không xoá placeholder) → undefined. */
const emailSchema = z
	.string()
	.trim()
	.max(LEAD_EMAIL_MAX)
	.transform((value) => (value === "" ? undefined : value))
	.pipe(z.email({ message: "Email không hợp lệ" }).optional());

/**
 * Body `POST /public/leads`. `.strict()` để key lạ (bot probing) bị 400.
 * `website` là honeypot — field ẩn trên form, bot điền là dính.
 */
export const leadSubmitSchema = z
	.object({
		name: z.string().trim().min(LEAD_NAME_MIN).max(LEAD_NAME_MAX),
		phone: z
			.string()
			.transform(normalizeVietnamPhone)
			.refine((value) => value !== null, {
				message: "Số điện thoại Việt Nam không hợp lệ",
			})
			.pipe(z.string()),
		email: emailSchema.optional(),
		birthDate: birthDateSchema.optional(),
		course: z.enum(LEAD_COURSES).optional(),
		studyMode: z.enum(LEAD_STUDY_MODES).optional(),
		studyDays: z.enum(LEAD_STUDY_DAYS).optional(),
		timeSlot: z.enum(LEAD_TIME_SLOTS).optional(),
		note: z.string().max(LEAD_NOTE_MAX).optional(),
		placement: z.string().max(LEAD_PLACEMENT_MAX).optional(),
		source: z.enum(LEAD_SOURCES).optional(),
		website: z.string().max(LEAD_NAME_MAX).optional(),
		elapsedMs: z.number().int().min(0),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.source === "placement-test" && !value.email) {
			ctx.addIssue({
				code: "custom",
				path: ["email"],
				message: "Email là bắt buộc",
			});
		}
	});
export type LeadSubmit = z.infer<typeof leadSubmitSchema>;

/** Query `GET /api/leads`. */
export const leadQuerySchema = z
	.object({
		q: z.string().trim().max(LEAD_QUERY_MAX).optional(),
		status: z.enum(LEAD_STATUSES).optional(),
		page: z.coerce.number().int().min(1).optional(),
	})
	.strict();
export type LeadQuery = z.infer<typeof leadQuerySchema>;

/** Body `PATCH /api/leads/:id`. */
export const leadPatchSchema = z
	.object({
		status: z.enum(LEAD_STATUSES),
		teacherNote: z.string().max(LEAD_TEACHER_NOTE_MAX).optional(),
	})
	.strict();
export type LeadPatch = z.infer<typeof leadPatchSchema>;

/** Một dòng lead trả client — KHÔNG có `ipHash` (không lộ vết chống spam). */
export interface LeadRow {
	id: string;
	name: string;
	phone: string;
	email: string;
	birthDate: string;
	course: string;
	studyMode: string;
	studyDays: string;
	timeSlot: string;
	note: string;
	placement: string;
	teacherNote: string;
	source: string;
	status: LeadStatus;
	submitCount: number;
	/** ISO timestamp. */
	createdAt: string;
	updatedAt: string;
	statusChangedAt: string | null;
}

/** Response `GET /api/leads` — counts tính trên filter `q`, không áp `status`. */
export interface LeadListResponse {
	rows: LeadRow[];
	total: number;
	page: number;
	pageSize: typeof LEAD_PAGE_SIZE;
	counts: Record<LeadStatus | "all", number>;
}
