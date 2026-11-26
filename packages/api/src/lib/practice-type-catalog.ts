import {
	ASSIGNMENT_BANDS,
	ASSIGNMENT_TEST_PRESETS,
	type PracticeSkill,
	quizTypeDisplay,
} from "../contracts";

/**
 * Nhóm alias dạng bài trùng nhãn giữa các phần thi Reading/Listening
 * (ví dụ `mcq`/`mcq1`/`mcq3` đều là trắc nghiệm 1 đáp án, `note`/`notes`
 * đều là Note completion). Key là canonical ID trả về trong facets/URL;
 * mảng value là tập raw ID trong DB được mở rộng khi lọc.
 */
const AUTO_SKILL_TYPE_ALIAS_GROUPS: ReadonlyMap<string, readonly string[]> =
	new Map([
		["mcq", ["mcq", "mcq1", "mcq3"]],
		["notes", ["notes", "note"]],
		["sent", ["sent", "sent4"]],
		["flow", ["flow", "flowchart"]],
		["matching", ["matching", "match2", "match"]],
	]);

const RAW_TO_CANONICAL_AUTO_TYPE: ReadonlyMap<string, string> = new Map(
	[...AUTO_SKILL_TYPE_ALIAS_GROUPS.entries()].flatMap(([canonical, aliases]) =>
		aliases.map((alias) => [alias, canonical] as const),
	),
);

/**
 * Nhãn dạng bài của Writing/Speaking — tách riêng theo skill vì `map` mang
 * nghĩa khác giữa Listening ("Map labelling") và Writing ("Bản đồ").
 * Được pin đồng bộ với `SKILLS` trong `assignment-presets.test.ts`.
 */
const PROMPT_SKILL_TYPE_LABELS: Readonly<
	Record<"writing" | "speaking", ReadonlyMap<string, string>>
> = {
	writing: new Map([
		["chart", "Biểu đồ"],
		["table", "Bảng số liệu"],
		["map", "Bản đồ"],
		["process", "Quy trình"],
		["discuss", "Discuss both views"],
		["opinion", "Opinion"],
		["advantage", "Advantages"],
		["problem", "Problem / Solution"],
	]),
	speaking: new Map([
		["hometown", "Hometown"],
		["work", "Work & study"],
		["place", "Place"],
		["person", "Person"],
		["object", "Object"],
		["cities", "Cities"],
		["education", "Education"],
	]),
};

function isAutoPracticeSkill(
	skill: PracticeSkill,
): skill is "reading" | "listening" {
	return skill === "reading" || skill === "listening";
}

/** Chuẩn hóa raw type về canonical ID của bộ lọc theo skill. */
export function canonicalizePracticeType(
	skill: PracticeSkill,
	rawType: string,
): string {
	const trimmed = rawType.trim();
	if (!trimmed) return "";
	if (!isAutoPracticeSkill(skill)) return trimmed;
	return RAW_TO_CANONICAL_AUTO_TYPE.get(trimmed) ?? trimmed;
}

/** Mở rộng canonical (hoặc alias) type sang toàn bộ raw ID trong DB cần khớp. */
export function expandPracticeTypeFilter(
	skill: PracticeSkill,
	rawType: string,
): string[] {
	const canonical = canonicalizePracticeType(skill, rawType);
	if (!canonical) return [];
	if (!isAutoPracticeSkill(skill)) return [canonical];
	const group = AUTO_SKILL_TYPE_ALIAS_GROUPS.get(canonical);
	return group ? [...group] : [canonical];
}

/** Nhãn hiển thị theo skill cho một dạng bài trong dropdown bộ lọc. */
export function practiceTypeLabel(
	skill: PracticeSkill,
	typeId: string,
): string {
	const canonical = canonicalizePracticeType(skill, typeId);
	if (!canonical) return "";
	if (skill === "writing" || skill === "speaking") {
		return PROMPT_SKILL_TYPE_LABELS[skill].get(canonical) ?? canonical;
	}
	return quizTypeDisplay(canonical).label;
}

/** Nhãn hiển thị phần thi (`Passage 1–3`, `Section 1–4`, `Task 1–2`, `Part 1–3`). */
export function practicePartLabel(
	skill: PracticeSkill,
	partId: string,
): string {
	const trimmed = partId.trim();
	if (!trimmed) return "";
	const slot = ASSIGNMENT_TEST_PRESETS[skill].slots.find(
		(entry) => entry.part === trimmed,
	);
	return slot?.label ?? trimmed;
}

/** Dedupe và sắp xếp danh sách phần thi theo thứ tự preset của skill. */
export function sortPracticeParts(
	skill: PracticeSkill,
	parts: Iterable<string>,
): string[] {
	const slotOrder = new Map(
		ASSIGNMENT_TEST_PRESETS[skill].slots.map((slot, index) => [
			slot.part,
			index,
		]),
	);
	const unique = new Set<string>();
	for (const part of parts) {
		const trimmed = part.trim();
		if (trimmed) unique.add(trimmed);
	}
	return [...unique].sort((a, b) => {
		const orderA = slotOrder.get(a);
		const orderB = slotOrder.get(b);
		if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
		if (orderA !== undefined) return -1;
		if (orderB !== undefined) return 1;
		return a.localeCompare(b, "en", { sensitivity: "base" });
	});
}

const BAND_ORDER = new Map<string, number>(
	ASSIGNMENT_BANDS.map((band, index) => [band, index]),
);

function parseBandNumber(raw: string): number | null {
	if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

/** Dedupe và sắp xếp band tăng dần an toàn (không phát sinh NaN comparator). */
export function sortPracticeBands(bands: Iterable<string>): string[] {
	const unique = new Set<string>();
	for (const band of bands) {
		const trimmed = band.trim();
		if (trimmed) unique.add(trimmed);
	}
	return [...unique].sort((a, b) => {
		const numA = parseBandNumber(a);
		const numB = parseBandNumber(b);
		if (numA !== null && numB !== null) {
			if (numA !== numB) return numA - numB;
			const orderA = BAND_ORDER.get(a);
			const orderB = BAND_ORDER.get(b);
			if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
			return a.localeCompare(b, "en", { sensitivity: "base" });
		}
		if (numA !== null) return -1;
		if (numB !== null) return 1;
		return a.localeCompare(b, "en", { sensitivity: "base" });
	});
}

/** Canonicalize, dedupe và sắp xếp dạng bài theo nhãn hiển thị. */
export function sortPracticeTypes(
	skill: PracticeSkill,
	rawTypes: Iterable<string>,
): string[] {
	const unique = new Set<string>();
	for (const raw of rawTypes) {
		const canonical = canonicalizePracticeType(skill, raw);
		if (canonical) unique.add(canonical);
	}
	return [...unique].sort((a, b) => {
		const byLabel = practiceTypeLabel(skill, a).localeCompare(
			practiceTypeLabel(skill, b),
			"en",
			{ sensitivity: "base" },
		);
		return byLabel !== 0
			? byLabel
			: a.localeCompare(b, "en", { sensitivity: "base" });
	});
}
