import type { EssayAnnotation } from "@teacher-os/api/contracts";
import { quizAttemptAnnotation } from "@teacher-os/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../app";

type AnnotationRow = Pick<
	typeof quizAttemptAnnotation.$inferSelect,
	"id" | "startOffset" | "endOffset" | "note"
>;

/** Map row DB → shape wire (offset DB `*_offset` → `start`/`end`). */
export function toEssayAnnotation(row: AnnotationRow): EssayAnnotation {
	return {
		id: row.id,
		start: row.startOffset,
		end: row.endOffset,
		note: row.note,
	};
}

/** Highlight của 1 attempt, sắp theo start. Luôn kèm predicate orgId (IDOR). */
export async function loadEssayAnnotations(
	db: Db,
	attemptId: string,
	orgId: string,
): Promise<EssayAnnotation[]> {
	const rows = await db
		.select()
		.from(quizAttemptAnnotation)
		.where(
			and(
				eq(quizAttemptAnnotation.attemptId, attemptId),
				eq(quizAttemptAnnotation.orgId, orgId),
			),
		)
		.orderBy(asc(quizAttemptAnnotation.startOffset));
	return rows.map(toEssayAnnotation);
}
