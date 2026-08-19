/**
 * Syllabus read repo (Wave 2) — owns the kernel→display mapping for the
 * syllabus module. Pure by design: no provider import here, so unit tests
 * stay independent of the env-validated runtime. Selection lives in
 * repos/use-syllabus.ts; writes stay on the Wave 0 command bus.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { Syllabus } from "@/lib/mock-data";

/**
 * Map kernel syllabus rows to the display shape. `totalLessons` always
 * recomputes from the tree (the stored column is a dead form value), like
 * the reducer's `recomputeTotalLessons` did; empty optional strings map to
 * the seed placeholders so the screens keep rendering unchanged.
 */
export function mapSyllabi(snapshot: KernelSnapshot): Syllabus[] {
	return snapshot.syllabi.map(
		(row): Syllabus => ({
			id: row.id,
			name: row.name,
			level: row.level,
			skill: row.skill,
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
					status: lesson.status as "done" | "current" | "upcoming",
				})),
			})),
		}),
	);
}
