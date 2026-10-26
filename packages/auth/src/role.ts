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
