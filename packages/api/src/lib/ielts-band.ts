/**
 * Quy ước chấm bài IELTS Writing/Speaking (#319) — dùng chung server, web và
 * student. File thuần TypeScript, không import gì, vì package này compile cho
 * cả workerd lẫn browser.
 */

export const WRITING_CRITERIA = [
	"task",
	"coherence",
	"lexical",
	"grammar",
] as const;
export const SPEAKING_CRITERIA = [
	"fluency",
	"lexical",
	"grammar",
	"pronunciation",
] as const;

export const GRADABLE_SKILLS = ["writing", "speaking"] as const;
export type GradableSkill = (typeof GRADABLE_SKILLS)[number];

export function isGradableSkill(skill: string): skill is GradableSkill {
	return (GRADABLE_SKILLS as readonly string[]).includes(skill);
}

export function criteriaForSkill(skill: GradableSkill): readonly string[] {
	return skill === "writing" ? WRITING_CRITERIA : SPEAKING_CRITERIA;
}

/** Nhãn tĩnh của tiêu chí theo skill — `task` của Writing đổi nhãn theo
 * part nên xử lý riêng trong `criterionLabel`, không nằm ở đây. */
const CRITERION_LABELS: Record<GradableSkill, Record<string, string>> = {
	writing: {
		coherence: "Coherence & Cohesion",
		lexical: "Lexical Resource",
		grammar: "Grammatical Range & Accuracy",
	},
	speaking: {
		fluency: "Fluency & Coherence",
		lexical: "Lexical Resource",
		grammar: "Grammatical Range & Accuracy",
		pronunciation: "Pronunciation",
	},
};

/** Nhãn hiển thị của một tiêu chí. Writing `task` đổi nhãn theo part:
 * task1 là "Task Achievement", task2 là "Task Response". Key lạ → chính key. */
export function criterionLabel(
	skill: GradableSkill,
	key: string,
	part: string,
): string {
	if (skill === "writing" && key === "task") {
		return part === "task1" ? "Task Achievement" : "Task Response";
	}
	return CRITERION_LABELS[skill][key] ?? key;
}

/** Điểm một tiêu chí hợp lệ: 0–9, bước 0.5 (v*2 phải là số nguyên). */
export function isBandStep(value: number): boolean {
	return (
		Number.isFinite(value) &&
		value >= 0 &&
		value <= 9 &&
		Number.isInteger(value * 2)
	);
}

/**
 * Band tổng IELTS = trung bình các tiêu chí, làm tròn theo quy ước IELTS:
 * `.25` lên `.5`, `.75` lên số nguyên kế (`Math.round(avg * 2) / 2`).
 * Band luôn derive từ scores, không lưu DB.
 */
export function ieltsOverallBand(scores: readonly number[]): number {
	if (scores.length === 0) throw new Error("no scores");
	const sum = scores.reduce((acc, value) => acc + value, 0);
	return Math.round((sum / scores.length) * 2) / 2;
}

/** Hiển thị band luôn có 1 chữ số thập phân: `7` → `"7.0"`, `6.5` → `"6.5"`. */
export function formatBand(band: number): string {
	return band.toFixed(1);
}
