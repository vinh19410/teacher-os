import { LEAD_PLACEMENT_MAX } from "./grading.js";

/**
 * Module thuần cho bước cổng thông tin cá nhân (/kiem-tra-dau-vao/, #534).
 * Không phụ thuộc DOM; chạy trực tiếp trên Node test runner và trình duyệt.
 */

export const LEAD_NAME_MIN = 2;
export const LEAD_NAME_MAX = 80;
export const LEAD_EMAIL_MAX = 120;
export const LEAD_NOTE_MAX = 500;
export const LEAD_MIN_SAFE_ELAPSED_MS = 3500;

/**
 * Nhóm khóa học khớp chính xác LEAD_COURSE_GROUPS, LEAD_COURSES và LEAD_COURSE_LABELS
 * trong @teacher-os/api/lead-contracts.
 */
export const PLACEMENT_COURSE_GROUPS = [
	{
		key: "ielts",
		label: "IELTS",
		options: [
			{ value: "ielts-foundation", label: "IELTS Foundation (0–3.0)" },
			{ value: "ielts-first-step", label: "IELTS First Step (3.0–3.5)" },
			{ value: "ielts-pre", label: "Pre IELTS (4.0–4.5)" },
			{ value: "ielts-advanced", label: "IELTS Advanced (5.0–7.5+)" },
			{
				value: "ielts-sw-intensive",
				label: "IELTS Speaking & Writing cấp tốc",
			},
			{ value: "ielts-single-skill", label: "IELTS cấp tốc 1 kỹ năng" },
		],
	},
	{
		key: "comm",
		label: "Giao tiếp định hướng IELTS",
		options: [
			{ value: "comm-1", label: "Giao tiếp 1" },
			{ value: "comm-2", label: "Giao tiếp 2" },
			{ value: "comm-3", label: "Giao tiếp 3" },
			{ value: "comm-4", label: "Giao tiếp 4" },
			{ value: "comm-5", label: "Giao tiếp 5" },
		],
	},
	{
		key: "other",
		label: "Khác",
		options: [{ value: "undecided", label: "Chưa rõ – cần test 1-1" }],
	},
];

/**
 * Hình thức lớp khớp chính xác LEAD_STUDY_MODES và LEAD_STUDY_MODE_LABELS.
 */
export const PLACEMENT_STUDY_MODES = [
	{ value: "group-online", label: "Bàn tròn 4–6 bạn, Google Meet" },
	{ value: "private-online", label: "Kèm 1-1, Google Meet" },
	{ value: "offline-vgp", label: "Offline Vinhomes Grand Park" },
];

const VALID_COURSES = new Set(
	PLACEMENT_COURSE_GROUPS.flatMap((g) => g.options.map((o) => o.value)),
);
const VALID_STUDY_MODES = new Set(PLACEMENT_STUDY_MODES.map((m) => m.value));

/**
 * Chuẩn hóa SĐT Việt Nam (D3): bỏ ký tự không phải số, tiền tố quốc tế
 * `84` → `0`, phải khớp `^0\d{9}$` (10 số, bắt đầu 0). Trả null khi lệch.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeVietnamPhone(raw) {
	const digits = String(raw ?? "").replace(/\D+/g, "");
	const local = digits.startsWith("84") ? `0${digits.slice(2)}` : digits;
	return /^0\d{9}$/.test(local) ? local : null;
}

function currentVietnamYear() {
	try {
		const parts = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Ho_Chi_Minh",
			year: "numeric",
		}).formatToParts(new Date());
		const yearPart = parts.find((p) => p.type === "year")?.value;
		if (yearPart) {
			return Number.parseInt(yearPart, 10);
		}
	} catch {
		// Fallback to local year if Intl timeZone is unavailable
	}
	return new Date().getFullYear();
}

/**
 * Kiểm tra ngày sinh định dạng yyyy-mm-dd hợp lệ thật và năm trong [1940, năm hiện tại giờ VN].
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isValidBirthDate(raw) {
	if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
		return false;
	}
	const parsed = new Date(`${raw}T00:00:00Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.toISOString().slice(0, 10) !== raw
	) {
		return false;
	}
	const year = Number.parseInt(raw.slice(0, 4), 10);
	const maxYear = currentVietnamYear();
	return year >= 1940 && year <= maxYear;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate toàn bộ trường của bước thông tin cá nhân trước khi vào bài test.
 * Họ tên, email và SĐT là bắt buộc; ngày sinh, khóa học, hình thức lớp và ghi chú là tuỳ chọn.
 *
 * @param {Record<string, unknown>} values
 */
export function validateLeadForm(values = {}) {
	const safe = values && typeof values === "object" ? values : {};
	const name = String(safe.name ?? "").trim();
	const email = String(safe.email ?? "").trim();
	const rawPhone = String(safe.phone ?? "").trim();
	const phone = normalizeVietnamPhone(rawPhone);
	const birthDate = String(safe.birthDate ?? "").trim();
	const course = String(safe.course ?? "").trim();
	const studyMode = String(safe.studyMode ?? "").trim();
	const note = String(safe.note ?? "").trim();

	/** @type {Record<string, string>} */
	const errors = {};

	if (name.length < LEAD_NAME_MIN || name.length > LEAD_NAME_MAX) {
		errors.name =
			"Vui lòng nhập họ và tên của bạn (tối thiểu 2 ký tự, tối đa 80 ký tự).";
	}

	if (email.length === 0) {
		errors.email = "Vui lòng nhập địa chỉ email của bạn.";
	} else if (email.length > LEAD_EMAIL_MAX || !EMAIL_RE.test(email)) {
		errors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
	}

	if (!phone) {
		errors.phone =
			"Vui lòng nhập số điện thoại Việt Nam hợp lệ (10 chữ số, bắt đầu bằng 0 hoặc +84).";
	}

	if (birthDate.length > 0 && !isValidBirthDate(birthDate)) {
		errors.birthDate = "Ngày sinh không hợp lệ (năm từ 1940 đến năm hiện tại).";
	}

	if (course.length > 0 && !VALID_COURSES.has(course)) {
		errors.course = "Khóa học đã chọn không hợp lệ.";
	}

	if (studyMode.length > 0 && !VALID_STUDY_MODES.has(studyMode)) {
		errors.studyMode = "Hình thức lớp đã chọn không hợp lệ.";
	}

	if (note.length > LEAD_NOTE_MAX) {
		errors.note = "Ghi chú không được vượt quá 500 ký tự.";
	}

	return {
		ok: Object.keys(errors).length === 0,
		errors,
		normalized: {
			name,
			phone: phone ?? rawPhone,
			email,
			birthDate,
			course,
			studyMode,
			note,
		},
	};
}

/**
 * Tạo body gửi `POST /public/leads` cho bước cổng hoặc đồng bộ điểm.
 * Luôn gắn `source: "placement-test"`, loại bỏ các trường tuỳ chọn rỗng,
 * cắt `placement` tối đa 300 ký tự, và đảm bảo `elapsedMs` không nhỏ hơn
 * thời gian đã trôi qua trên trang lẫn ngưỡng an toàn 3500ms.
 *
 * @param {{
 *   lead: Record<string, unknown>,
 *   placement?: string,
 *   elapsedMs?: number,
 *   website?: string
 * }} params
 */
export function buildLeadPayload({
	lead = {},
	placement = "",
	elapsedMs = 0,
	website = "",
} = {}) {
	const safeLead = lead && typeof lead === "object" ? lead : {};
	const name = String(safeLead.name ?? "").trim();
	const rawPhone = String(safeLead.phone ?? "").trim();
	const phone = normalizeVietnamPhone(rawPhone) ?? rawPhone;
	const email = String(safeLead.email ?? "").trim();
	const birthDate = String(safeLead.birthDate ?? "").trim();
	const course = String(safeLead.course ?? "").trim();
	const studyMode = String(safeLead.studyMode ?? "").trim();
	const note = String(safeLead.note ?? "").trim();
	const cleanPlacement = String(placement ?? "")
		.trim()
		.slice(0, LEAD_PLACEMENT_MAX);
	const cleanWebsite = String(website ?? "").slice(0, LEAD_NAME_MAX);
	const rawElapsed = Number.isFinite(elapsedMs)
		? Math.max(0, Math.floor(Number(elapsedMs)))
		: 0;

	/** @type {Record<string, unknown>} */
	const payload = {
		name,
		phone,
		email,
		source: "placement-test",
		elapsedMs: Math.max(LEAD_MIN_SAFE_ELAPSED_MS, rawElapsed),
	};

	if (birthDate.length > 0) payload.birthDate = birthDate;
	if (course.length > 0 && VALID_COURSES.has(course)) payload.course = course;
	if (studyMode.length > 0 && VALID_STUDY_MODES.has(studyMode)) {
		payload.studyMode = studyMode;
	}
	if (note.length > 0) payload.note = note.slice(0, LEAD_NOTE_MAX);
	if (cleanPlacement.length > 0) payload.placement = cleanPlacement;
	if (cleanWebsite.length > 0) payload.website = cleanWebsite;

	return payload;
}

/**
 * Quy đổi HTTP status và body lỗi từ `POST /public/leads` sang thông báo tiếng Việt.
 * @param {number} status
 * @param {unknown} body
 */
export function leadErrorMessage(status, body = null) {
	const safeBody = body && typeof body === "object" ? body : {};
	const rawFields = Array.isArray(safeBody.fields) ? safeBody.fields : [];
	const fields = rawFields.filter((f) => typeof f === "string");

	if (status === 400) {
		return {
			kind: "field",
			fields,
			message:
				"Thông tin chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu bên dưới.",
		};
	}

	if (status === 429) {
		return {
			kind: "rate_limit",
			fields: [],
			message:
				"Có quá nhiều lượt đăng ký từ mạng này. Vui lòng thử lại sau ít phút hoặc nhắn Zalo cô Mỹ.",
		};
	}

	return {
		kind: "busy",
		fields: [],
		message:
			"Hệ thống đang bận, chưa thể lưu thông tin của bạn. Vui lòng thử lại hoặc nhắn Zalo cô Mỹ.",
	};
}
