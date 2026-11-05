export const EMPTY_STUDENT_TARGET_LABEL = "Chưa đặt mục tiêu";
export const EMPTY_BAND_TOKEN = "—";

export interface StudentTargetInput {
	targetBand?: string | number | null;
	skills?: Array<string | null | undefined> | null;
}

/**
 * Chuẩn hóa giá trị band mục tiêu:
 * - Chấp nhận chuỗi hoặc số hợp lệ (bỏ qua NaN/Infinity).
 * - Loại bỏ tiền tố 'Band ' không phân biệt hoa thường.
 * - Trả về `null` nếu rỗng, chỉ gồm từ 'band', hoặc mang sentinel '—' (`EMPTY_BAND_TOKEN`).
 * - Trả về chuỗi band sạch (ví dụ: "6.5", "7.0") nếu hợp lệ.
 */
function normalizeTargetBand(
	targetBand?: string | number | null,
): string | null {
	const raw =
		typeof targetBand === "string"
			? targetBand.trim()
			: typeof targetBand === "number" && Number.isFinite(targetBand)
				? String(targetBand).trim()
				: "";

	if (raw === "") {
		return null;
	}

	const clean = raw.replace(/^band\s*/i, "").trim();
	if (
		clean === "" ||
		clean === EMPTY_BAND_TOKEN ||
		clean.toLowerCase() === "band"
	) {
		return null;
	}

	return clean;
}

/**
 * Định dạng cột 'Band mục tiêu' trong danh sách học viên lớp học (#625).
 * - Học viên có mục tiêu hợp lệ: `Band {band}`
 * - Học viên chưa đặt mục tiêu (rỗng hoặc mang sentinel '—'): `—`
 */
export function formatTargetBand(targetBand?: string | number | null): string {
	const band = normalizeTargetBand(targetBand);
	return band ? `Band ${band}` : EMPTY_BAND_TOKEN;
}

/**
 * Định dạng dòng mục tiêu học viên hiển thị trên kicker của trang chi tiết.
 * - Có band & skills: `Mục tiêu: Band {band} ({skills})`
 * - Có band, không skills: `Mục tiêu: Band {band}`
 * - Không band, có skills: `Mục tiêu: {skills}`
 * - Không band & không skills (hoặc mặc định '—' của DB): `Chưa đặt mục tiêu`
 */
export function formatStudentTarget(
	student?: StudentTargetInput | null,
): string {
	const band = normalizeTargetBand(student?.targetBand);
	const validSkills = (student?.skills ?? [])
		.filter((s): s is string => typeof s === "string")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);

	if (band && validSkills.length > 0) {
		return `Mục tiêu: Band ${band} (${validSkills.join(", ")})`;
	}
	if (band) {
		return `Mục tiêu: Band ${band}`;
	}
	if (validSkills.length > 0) {
		return `Mục tiêu: ${validSkills.join(", ")}`;
	}
	return EMPTY_STUDENT_TARGET_LABEL;
}
