import type { EssayAnnotation } from "@teacher-os/api/contracts";
import {
	essayToPlain,
	type PlainEssayView,
	rawToPlain,
} from "@teacher-os/api/lib/essay-plain";
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

/**
 * Quy đổi 1 annotation lưu offset raw trong DB sang offset trên `view.text`
 * (plain). Trả `null` nếu đoạn nằm trọn trong thẻ HTML hoặc ngoài biên.
 */
export function toPlainAnnotation(
	view: PlainEssayView,
	ann: EssayAnnotation,
): EssayAnnotation | null {
	const span = rawToPlain(view, ann.start, ann.end);
	if (!span) return null;
	if (span.start === ann.start && span.end === ann.end) return ann;
	return { ...ann, start: span.start, end: span.end };
}

/**
 * Chuẩn hoá `rawEssay` sang plain text và quy đổi toàn bộ `rawAnnotations`
 * sang offset plain tại một điểm tập trung ở server (#382).
 */
export function toEssayView(
	rawEssay: string,
	rawAnnotations: ReadonlyArray<EssayAnnotation>,
): {
	view: PlainEssayView;
	essay: string;
	annotations: EssayAnnotation[];
} {
	const view = essayToPlain(rawEssay);
	const annotations: EssayAnnotation[] = [];
	for (const ann of rawAnnotations) {
		const mapped = toPlainAnnotation(view, ann);
		if (mapped) annotations.push(mapped);
	}
	return { view, essay: view.text, annotations };
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
