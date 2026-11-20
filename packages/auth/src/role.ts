export type AppRole = "teacher" | "student" | "admin";

/**
 * State key stamped server-side into the OAuth `additionalData` (verification
 * table) at `/sign-in/social` initiation so the `/callback/:id` request — which
 * carries no Origin header on top-level GET navigation — can still resolve the
 * originating app (plan #260 D5).
 */
export const OAUTH_APP_STATE_KEY = "app";

/** DB role column → AppRole. NULL/unknown falls back to teacher (defensive for
 * out-of-band rows; migration 0024 guarantees no NULL rows after backfill).
 * `admin` là role thật trong DB (plan #413) — không rơi vào nhánh teacher. */
export function resolveUserRole(role: string | null | undefined): AppRole {
	if (role === "student") return "student";
	if (role === "admin") return "admin";
	return "teacher";
}

export const ROLE_HOME_PATH: Record<AppRole, string> = {
	teacher: "/teacher",
	student: "/student",
	admin: "/admin",
};

export function roleHomePath(role: string | null | undefined): string {
	return ROLE_HOME_PATH[resolveUserRole(role)];
}

export function isPathForRole(pathname: string, role: AppRole): boolean {
	const prefix = ROLE_HOME_PATH[role];
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const REDIRECT_SCHEME_PREFIX_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const REDIRECT_BASE_ORIGIN = "https://lms.invalid";

function hasControlCharacter(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

/**
 * Chuẩn hóa đích redirect sau đăng nhập theo role hiện tại. Chặn open redirect
 * (scheme, protocol-relative `//`, backslash `/\`, ký tự điều khiển, URI lỗi,
 * path traversal) và chỉ chấp nhận đường dẫn thuộc namespace của role đó.
 */
export function resolvePostAuthRedirect(
	role: string | null | undefined,
	returnUrl: string | null | undefined,
): string {
	const resolvedRole = resolveUserRole(role);
	const fallback = ROLE_HOME_PATH[resolvedRole];
	if (typeof returnUrl !== "string" || returnUrl.length === 0) {
		return fallback;
	}
	if (hasControlCharacter(returnUrl)) {
		return fallback;
	}

	let candidate = returnUrl;
	for (let round = 0; round < 2; round += 1) {
		let decoded: string;
		try {
			decoded = decodeURIComponent(candidate);
		} catch {
			return fallback;
		}
		if (hasControlCharacter(decoded)) {
			return fallback;
		}
		if (decoded === candidate) {
			break;
		}
		candidate = decoded;
	}

	if (
		!candidate.startsWith("/") ||
		candidate.startsWith("//") ||
		candidate.startsWith("/\\") ||
		REDIRECT_SCHEME_PREFIX_RE.test(candidate)
	) {
		return fallback;
	}

	let parsed: URL;
	try {
		parsed = new URL(candidate, REDIRECT_BASE_ORIGIN);
	} catch {
		return fallback;
	}

	if (
		parsed.origin !== REDIRECT_BASE_ORIGIN ||
		!isPathForRole(parsed.pathname, resolvedRole)
	) {
		return fallback;
	}

	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Xác định role khi đăng ký qua domain hợp nhất dựa trên allowlist email.
 * Ưu tiên: `adminEmails` > `teacherEmails` > `"student"` (least privilege).
 */
export function resolveAllowlistRole(
	email: string | null | undefined,
	options: { adminEmails?: string[]; teacherEmails?: string[] } = {},
): AppRole {
	const normalized = (email ?? "").trim().toLowerCase();
	if (!normalized) return "student";
	if (
		(options.adminEmails ?? []).some(
			(entry) => entry.trim().toLowerCase() === normalized,
		)
	) {
		return "admin";
	}
	if (
		(options.teacherEmails ?? []).some(
			(entry) => entry.trim().toLowerCase() === normalized,
		)
	) {
		return "teacher";
	}
	return "student";
}

function matchOrigin(origin: string, known: string[]): boolean {
	const normalized = origin.trim().toLowerCase();
	return (
		normalized.length > 0 &&
		normalized !== "null" &&
		known.some((o) => o.trim().toLowerCase() === normalized)
	);
}

/**
 * App nguồn của request sign-up/session. Chỉ origin khớp CHÍNH XÁC một origin
 * đã biết mới đáng tin; origin lạ / chuỗi "null" / thiếu → rơi về oauthApp
 * (server-side stamp), cuối cùng mặc định "student" (least privilege — không
 * bao giờ default teacher với tín hiệu không tin cậy, plan #260 D3).
 */
export function resolveRequestApp(input: {
	origin: string | null | undefined;
	oauthApp?: string | null;
	studentOrigins: string[];
	teacherOrigins: string[];
	adminOrigins?: string[];
}): AppRole {
	// matchOrigin tự loại origin rỗng/"null", nên null|undefined chỉ cần về "".
	const origin = input.origin ?? "";
	if (matchOrigin(origin, input.studentOrigins)) {
		return "student";
	}
	if (matchOrigin(origin, input.teacherOrigins)) {
		return "teacher";
	}
	if (matchOrigin(origin, input.adminOrigins ?? [])) {
		return "admin";
	}
	if (
		input.oauthApp === "teacher" ||
		input.oauthApp === "student" ||
		input.oauthApp === "admin"
	) {
		return input.oauthApp;
	}
	return "student";
}

/**
 * TOS-17 (#451) / FR-selfomy-alignment-029: vocabulary vai trò thành viên tổ
 * chức (`membership.role`).
 * - `"teacher"`: giáo viên độc lập hiện có (chủ org khi tự đăng ký) — giữ quyền
 *   tài chính.
 * - `"owner"`, `"admin"`: chủ trung tâm / quản trị viên — có quyền tài chính.
 * - `"class_teacher"`: Giáo viên đứng lớp (TOS-48) — KHÔNG có quyền tài chính.
 * - `"ta"`: Trợ giảng (TOS-48) — KHÔNG có quyền tài chính.
 *
 * Allowlist nghiêm ngặt (least privilege): mọi giá trị khác (rỗng, null, lạ)
 * đều bị chặn truy cập Sổ công nợ / Doanh thu / API tài chính.
 */
export const FINANCE_ROLES = ["teacher", "owner", "admin"] as const;
export type FinanceRole = (typeof FINANCE_ROLES)[number];
export type OrgMemberRole = FinanceRole | "class_teacher" | "ta";

const FINANCE_ROLE_MAP: Record<string, true> = {
	teacher: true,
	owner: true,
	admin: true,
};

export function canAccessFinance(role: string | null | undefined): boolean {
	return typeof role === "string" && FINANCE_ROLE_MAP[role] === true;
}

/**
 * TOS-24 (#470): vai trò được nhập đề bằng AI (plan D8) — chỉ `teacher` +
 * `owner`; `ta` chỉ xem, `class_teacher`/giá trị lạ bị chặn. Allowlist
 * nghiêm ngặt least-privilege như `canAccessFinance`.
 */
export const EXAM_IMPORT_ROLES = ["teacher", "owner"] as const;

const EXAM_IMPORT_ROLE_MAP: Record<string, true> = {
	teacher: true,
	owner: true,
};

export function canImportExam(role: string | null | undefined): boolean {
	return typeof role === "string" && EXAM_IMPORT_ROLE_MAP[role] === true;
}

/**
 * TOS-33 (#481, AC-004): vai trò chấm/rà trên màn "Rà soát chấm bài AI" [7].
 * Hai allowlist RIÊNG (không copy `canImportExam` — nó chặn
 * `class_teacher`):
 * - `canPublishGrade` ("Chốt trả bài" + "Thử chấm lại AI" — hành vi tiêu
 *   Credit của tổ chức): `teacher`, `owner`, `admin`, `class_teacher`.
 *   `ta` chỉ lưu bản nháp, bị chặn publish/retry (403).
 * - `canReviewGrade` ("Lưu bản nháp" `teacher_reviewing`): các vai trên
 *   + `ta`.
 * Allowlist nghiêm ngặt least-privilege như `canAccessFinance`.
 */
export const GRADING_PUBLISH_ROLES = [
	"teacher",
	"owner",
	"admin",
	"class_teacher",
] as const;
export const GRADING_REVIEW_ROLES = [...GRADING_PUBLISH_ROLES, "ta"] as const;

const GRADING_PUBLISH_ROLE_MAP: Record<string, true> = {
	teacher: true,
	owner: true,
	admin: true,
	class_teacher: true,
};

const GRADING_REVIEW_ROLE_MAP: Record<string, true> = {
	...GRADING_PUBLISH_ROLE_MAP,
	ta: true,
};

export function canPublishGrade(role: string | null | undefined): boolean {
	return typeof role === "string" && GRADING_PUBLISH_ROLE_MAP[role] === true;
}

export function canReviewGrade(role: string | null | undefined): boolean {
	return typeof role === "string" && GRADING_REVIEW_ROLE_MAP[role] === true;
}

/**
 * #646: vai trò đọc/ghi Ngân hàng tài liệu & tài liệu buổi học — tách độc lập
 * hoàn toàn khỏi `GRADING_*` để thay đổi chính sách chấm bài không làm trôi
 * quyền học liệu:
 * - `canWriteMaterials`: `teacher`, `owner`, `admin`, `class_teacher`.
 * - `canReadMaterials`: các vai trên + `ta` (chỉ đọc/mở/chọn từ ngân hàng).
 */
export const MATERIAL_WRITE_ROLES = [
	"teacher",
	"owner",
	"admin",
	"class_teacher",
] as const;
export const MATERIAL_READ_ROLES = [...MATERIAL_WRITE_ROLES, "ta"] as const;

const MATERIAL_WRITE_ROLE_MAP: Record<string, true> = {
	teacher: true,
	owner: true,
	admin: true,
	class_teacher: true,
};

const MATERIAL_READ_ROLE_MAP: Record<string, true> = {
	...MATERIAL_WRITE_ROLE_MAP,
	ta: true,
};

export function canWriteMaterials(role: string | null | undefined): boolean {
	return typeof role === "string" && MATERIAL_WRITE_ROLE_MAP[role] === true;
}

export function canReadMaterials(role: string | null | undefined): boolean {
	return typeof role === "string" && MATERIAL_READ_ROLE_MAP[role] === true;
}

/**
 * #694: vai trò chuyển trạng thái lớp (Tạm dừng ↔ Đang học) — theo chuẩn
 * `MATERIAL_WRITE_ROLES` (`teacher`, `owner`, `admin`, `class_teacher`); `ta` bị
 * chặn `403`. Khác với wrapper ở `kernel.ts` (giữ `role === undefined` cho test
 * harness), helper trong `@teacher-os/auth` luôn fail-closed.
 */
export const CLASS_STATUS_MANAGE_ROLES = MATERIAL_WRITE_ROLES;

const CLASS_STATUS_MANAGE_ROLE_MAP: Record<string, true> = {
	...MATERIAL_WRITE_ROLE_MAP,
};

export function canManageClassStatus(role: string | null | undefined): boolean {
	return (
		typeof role === "string" && CLASS_STATUS_MANAGE_ROLE_MAP[role] === true
	);
}
