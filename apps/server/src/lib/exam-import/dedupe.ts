import {
	type ExamImportDuplicate,
	extractedExamDraftSchema,
} from "@teacher-os/api/contracts";
import { examImportJob } from "@teacher-os/db/schema/exam-import-job";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../../app";

/**
 * TOS-25 (#471): tìm job `completed` mới nhất của org theo
 * `content_fingerprint` để chặn re-import (0 Credit).
 *
 * Định nghĩa "trùng" (plan D2): `import_status = 'completed'` **và**
 * `draft_json` NOT NULL — job completed-mất-draft (cửa sổ crash-sau-settle,
 * nhánh settled-retry của route chỉ set status mà không ghi draft) không có
 * gì để "mở lại", phải cho import lại thay vì khoá vĩnh viễn tệp.
 *
 * Tiebreaker deterministic (plan Rủi ro): `completed_at DESC, started_at
 * DESC, id` — hai upload song song cùng hoàn tất vẫn chọn ra đúng một job.
 *
 * `title` parse từ `draft_json` (không có cột riêng — red-team #3); JSON
 * hỏng/lệch schema → fallback `fileName`, hàm không bao giờ ném.
 */
export async function findCompletedImportByFingerprint(
	db: Db,
	orgId: string,
	fingerprint: string,
): Promise<ExamImportDuplicate | null> {
	const [row] = await db
		.select()
		.from(examImportJob)
		.where(
			and(
				eq(examImportJob.orgId, orgId),
				eq(examImportJob.contentFingerprint, fingerprint),
				eq(examImportJob.importStatus, "completed"),
				isNotNull(examImportJob.draftJson),
			),
		)
		.orderBy(
			desc(examImportJob.completedAt),
			desc(examImportJob.startedAt),
			asc(examImportJob.id),
		)
		.limit(1);
	if (!row) return null;
	let title: string | null = null;
	if (row.draftJson) {
		try {
			const parsed = extractedExamDraftSchema.safeParse(
				JSON.parse(row.draftJson),
			);
			if (parsed.success) title = parsed.data.title;
		} catch {
			// draft JSON hỏng — fallback `fileName` bên dưới.
		}
	}
	return {
		jobId: row.id,
		title: title ?? row.fileName,
		completedAt: row.completedAt?.toISOString() ?? row.startedAt.toISOString(),
	};
}
