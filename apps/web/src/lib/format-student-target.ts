export const EMPTY_STUDENT_TARGET_LABEL = "Chưa đặt mục tiêu";
export const EMPTY_BAND_TOKEN = "—";

export interface StudentTargetInput {
	targetBand?: string | number | null;
	skills?: Array<string | null | undefined> | null;
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
	const rawBand =
		typeof student?.targetBand === "string"
			? student.targetBand.trim()
			: student?.targetBand != null
				? String(student.targetBand).trim()
				: "";
	const band = rawBand === "" || rawBand === EMPTY_BAND_TOKEN ? null : rawBand;

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
