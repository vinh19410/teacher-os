/**
 * Syllabus-module read hooks (Wave 2 + issue #394) — the /syllabus routes'
 * only data entry. Reads from the kernel-backed store cache so command-bus
 * writes (add/edit module & lesson) land immediately; re-render granularity
 * matches useData (any store change) until a later wave narrows it.
 * No second fetch.
 *
 * Phân loại Template vs Giáo trình của lớp đi qua `splitSyllabi` (D7) —
 * consumers dùng `useTemplates()` / `useClassCurriculum(classId)`,
 * không tự so `classId`.
 */
import { useMemo } from "react";
import type { CurriculumTarget } from "@/lib/data-actions";
import { useData } from "@/lib/data-store";
import type {
	ClassCurriculum,
	Syllabus,
	SyllabusTemplate,
} from "@/lib/mock-data";
import { isCurriculumOutOfSync, splitSyllabi } from "./syllabus";

export interface SyllabusRead {
	syllabi: Syllabus[];
	syllabusById(id: string): Syllabus | undefined;
}

export function useSyllabus(): SyllabusRead {
	const { data } = useData();
	return useMemo(
		() => ({
			syllabi: data.syllabi,
			syllabusById: (id: string) => data.syllabi.find((s) => s.id === id),
		}),
		[data],
	);
}

/** Template dùng chung (classId null) — nguồn của TemplatePicker. */
export function useTemplates(): SyllabusTemplate[] {
	const { data } = useData();
	return useMemo(() => splitSyllabi(data.syllabi).templates, [data]);
}

/** Giáo trình của đúng một lớp — đọc theo `syllabus.class_id` (nguồn sự thật). */
export function useClassCurriculum(classId: string): ClassCurriculum | null {
	const { data } = useData();
	return useMemo(() => {
		const { curriculumByClassId } = splitSyllabi(data.syllabi);
		return curriculumByClassId.get(classId) ?? null;
	}, [data, classId]);
}

/** Bản đồ templateId → danh sách classId đang dùng copy của nó. */
export function useTemplateUsage(): Map<string, string[]> {
	const { data } = useData();
	return useMemo(() => splitSyllabi(data.syllabi).templateUsage, [data]);
}

/**
 * Dòng syllabus tương ứng một `CurriculumTarget` — template tra theo id,
 * class target tra qua `splitSyllabi` (nguồn sự thật class_id). `null`
 * khi target chưa chọn hoặc copy chưa tồn tại.
 */
export function useTargetSyllabus(
	target: CurriculumTarget | null,
): Syllabus | null {
	const { data } = useData();
	return useMemo(() => {
		if (!target) return null;
		if (target.kind === "template") {
			return data.syllabi.find((s) => s.id === target.syllabusId) ?? null;
		}
		return (
			splitSyllabi(data.syllabi).curriculumByClassId.get(target.classId) ?? null
		);
	}, [data, target]);
}

export type CurriculumSyncState =
	| { kind: "no-curriculum" }
	| { kind: "missing-source-template"; curriculum: ClassCurriculum }
	| {
			kind: "synced";
			curriculum: ClassCurriculum;
			sourceTemplate: SyllabusTemplate;
	  }
	| {
			kind: "out-of-sync";
			curriculum: ClassCurriculum;
			sourceTemplate: SyllabusTemplate;
	  };

/** Trạng thái đồng bộ giữa giáo trình của lớp và template gốc (#700). */
export function useClassCurriculumSyncState(
	classId: string,
): CurriculumSyncState {
	const { data } = useData();
	return useMemo(() => {
		const { templates, curriculumByClassId } = splitSyllabi(data.syllabi);
		const copy = curriculumByClassId.get(classId);
		if (!copy) return { kind: "no-curriculum" };
		if (copy.sourceTemplateId === null) {
			return { kind: "missing-source-template", curriculum: copy };
		}
		const sourceTemplate = templates.find(
			(t) => t.id === copy.sourceTemplateId,
		);
		if (!sourceTemplate) {
			return { kind: "missing-source-template", curriculum: copy };
		}
		return isCurriculumOutOfSync(copy, sourceTemplate)
			? { kind: "out-of-sync", curriculum: copy, sourceTemplate }
			: { kind: "synced", curriculum: copy, sourceTemplate };
	}, [data, classId]);
}
