/**
 * Syllabus read repo (Wave 2) — owns the kernel→display mapping for the
 * syllabus module. Pure by design: no provider import here, so unit tests
 * stay independent of the env-validated runtime. Selection lives in
 * repos/use-syllabus.ts; writes stay on the Wave 0 command bus.
 */
import type {
	KernelSnapshot,
	KernelSyllabusLessonRow,
} from "@teacher-os/api/contracts";
import type { SyllabusBankMaterialRef } from "@teacher-os/api/material-contracts";
import type {
	ClassCurriculum,
	Syllabus,
	SyllabusLessonKind,
	SyllabusTemplate,
} from "@/lib/mock-data";

const LESSON_KINDS: readonly SyllabusLessonKind[] = [
	"lesson",
	"midterm",
	"final",
];

/**
 * Normalize kind từ snapshot — giá trị lạ/missing → "lesson" (mirror fallback
 * `lessonDotClassFor`: snapshot cũ/khác version không được crash UI).
 */
function normalizeKind(value: unknown): SyllabusLessonKind {
	const kind = value as SyllabusLessonKind;
	return LESSON_KINDS.includes(kind) ? kind : "lesson";
}

/**
 * #655 — bài học trên snapshot có thể kèm tài liệu ngân hàng; snapshot cũ
 * (hoặc server chưa trả) → undefined, khớp field optional của SyllabusLesson.
 */
type LessonRowWithBankMaterials = KernelSyllabusLessonRow & {
	bankMaterials?: SyllabusBankMaterialRef[];
};

/**
 * Map kernel syllabus rows to the display shape. `totalLessons` always
 * recomputes from the tree (the stored column is a dead form value), like
 * the reducer's `recomputeTotalLessons` did; empty optional strings map to
 * the seed placeholders so the screens keep rendering unchanged.
 */
export function mapSyllabi(snapshot: KernelSnapshot): Syllabus[] {
	return snapshot.syllabi.map((row): Syllabus => {
		const legacy = row as typeof row & { skill?: string };
		const skills = Array.isArray(legacy.skills)
			? legacy.skills
			: legacy.skill
				? [legacy.skill]
				: [];
		return {
			id: row.id,
			name: row.name,
			level: row.level,
			type: row.type === "communication" ? "communication" : "ielts",
			classId: row.classId,
			sourceTemplateId: row.sourceTemplateId,
			skills,
			totalLessons: row.modules.reduce((sum, m) => sum + m.lessons.length, 0),
			description: row.description,
			modules: row.modules.map((mod) => ({
				id: mod.id,
				title: mod.title,
				description: mod.description || undefined,
				lessons: (mod.lessons as LessonRowWithBankMaterials[]).map(
					(lesson) => ({
						id: lesson.id,
						title: lesson.title,
						objectives: lesson.objectives || "—",
						materials: lesson.materials || "—",
						bankMaterials: lesson.bankMaterials,
						kind: normalizeKind(lesson.kind),
						status: lesson.status as "done" | "current" | "upcoming",
					}),
				),
			})),
		};
	});
}

/**
 * Nơi DUY NHẤT trong apps/web (ngoài test) được so sánh `classId` để phân loại
 * (design D7, issue #394): template là `classId === null`, giáo trình của lớp
 * là bản copy `classId === <lớp>`. `templateUsage` khoá theo `sourceTemplateId`
 * — danh sách lớp đang dùng template (chỉ đếm copy có nguồn rõ ràng).
 */
export function splitSyllabi(syllabi: Syllabus[]): {
	templates: SyllabusTemplate[];
	curriculumByClassId: Map<string, ClassCurriculum>;
	templateUsage: Map<string, string[]>;
} {
	const templates: SyllabusTemplate[] = [];
	const curriculumByClassId = new Map<string, ClassCurriculum>();
	const templateUsage = new Map<string, string[]>();
	for (const sy of syllabi) {
		if (sy.classId === null) {
			templates.push(sy as SyllabusTemplate);
			continue;
		}
		curriculumByClassId.set(sy.classId, sy as ClassCurriculum);
		if (sy.sourceTemplateId !== null) {
			const used = templateUsage.get(sy.sourceTemplateId);
			if (used) {
				used.push(sy.classId);
			} else {
				templateUsage.set(sy.sourceTemplateId, [sy.classId]);
			}
		}
	}
	return { templates, curriculumByClassId, templateUsage };
}

/**
 * So sánh cấu trúc nội dung giữa bản sao giáo trình của lớp và template gốc
 * (#700). Bỏ qua `id` (syllabus/module/lesson) và `status` của bài học; dùng
 * trực tiếp sau `mapSyllabi` (đã chuẩn hóa `objectives`/`materials` rỗng → "—").
 */
export function isCurriculumOutOfSync(
	copy: ClassCurriculum,
	template: SyllabusTemplate,
): boolean {
	if (
		copy.name !== template.name ||
		copy.level !== template.level ||
		copy.type !== template.type ||
		copy.description !== template.description
	) {
		return true;
	}
	if (
		copy.skills.length !== template.skills.length ||
		copy.skills.some((skill, i) => skill !== template.skills[i])
	) {
		return true;
	}
	if (copy.modules.length !== template.modules.length) {
		return true;
	}
	for (let mi = 0; mi < copy.modules.length; mi++) {
		const modCopy = copy.modules[mi];
		const modTpl = template.modules[mi];
		if (!modCopy || !modTpl) return true;
		if (
			modCopy.title !== modTpl.title ||
			(modCopy.description ?? "") !== (modTpl.description ?? "") ||
			modCopy.lessons.length !== modTpl.lessons.length
		) {
			return true;
		}
		for (let li = 0; li < modCopy.lessons.length; li++) {
			const lessonCopy = modCopy.lessons[li];
			const lessonTpl = modTpl.lessons[li];
			if (!lessonCopy || !lessonTpl) return true;
			if (
				lessonCopy.title !== lessonTpl.title ||
				lessonCopy.objectives !== lessonTpl.objectives ||
				lessonCopy.materials !== lessonTpl.materials ||
				lessonCopy.kind !== lessonTpl.kind
			) {
				return true;
			}
			const copyBank = lessonCopy.bankMaterials ?? [];
			const tplBank = lessonTpl.bankMaterials ?? [];
			if (
				copyBank.length !== tplBank.length ||
				copyBank.some((b, bi) => b.id !== tplBank[bi]?.id)
			) {
				return true;
			}
		}
	}
	return false;
}
