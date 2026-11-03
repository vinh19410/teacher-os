import { classAssignment } from "@teacher-os/db/schema/index";
import { isNull, lte, or, type SQL } from "drizzle-orm";

/**
 * Bộ lọc hiển thị bài tập theo thời điểm mở bài (`available_at`).
 * Bài giao tay thông thường có `available_at IS NULL` -> hiển thị ngay.
 * Bài thuộc bộ đề tự học (#533) chỉ hiển thị khi `available_at <= now`.
 */
export function visibleAssignmentFilter(
	now: Date = new Date(),
): SQL | undefined {
	return or(
		isNull(classAssignment.availableAt),
		lte(classAssignment.availableAt, now),
	);
}
