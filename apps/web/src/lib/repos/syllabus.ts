/**
 * Syllabus read repo (Wave 2) — owns the kernel→display mapping for the
 * syllabus module. Pure by design: no provider import here, so unit tests
 * stay independent of the env-validated runtime. Selection lives in
 * repos/use-syllabus.ts; writes stay on the Wave 0 command bus.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
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
				lessons: mod.lessons.map((lesson) => ({
					id: lesson.id,
					title: lesson.title,
					objectives: lesson.objectives || "—",
					materials: lesson.materials || "—",
					kind: normalizeKind(lesson.kind),
					status: lesson.status as "done" | "current" | "upcoming",
				})),
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
