import {
	classAssignment,
	classAssignmentTarget,
	quizAttempt,
} from "@teacher-os/db/schema/index";
import { and, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";

/**
 * Bộ lọc hiển thị bài tập theo thời điểm mở bài (`available_at`).
 * Bài giao tay thông thường có `available_at IS NULL` -> hiển thị ngay.
 * Bài giao tay hẹn giờ (`class_study_pack_id IS NULL`) chỉ hiển thị khi `available_at <= now`.
 */
export function visibleAssignmentFilter(
	now: Date = new Date(),
): SQL | undefined {
	return or(
		isNull(classAssignment.availableAt),
		lte(classAssignment.availableAt, now),
	);
}

/**
 * Bộ lọc truy cập bài tập của học viên:
 * mở khóa toàn bộ bài thuộc bộ đề tự học (`class_study_pack_id IS NOT NULL`)
 * để học viên xem và làm trước bất kỳ ngày nào, trong khi vẫn giữ gate
 * `available_at <= now` cho bài giao tay hẹn giờ.
 */
export function accessibleAssignmentFilter(
	now: Date = new Date(),
): SQL | undefined {
	return or(
		isNotNull(classAssignment.classStudyPackId),
		isNull(classAssignment.availableAt),
		lte(classAssignment.availableAt, now),
	);
}

/**
 * Bộ lọc gọn cho `/api/student/overview`:
 * giữ ẩn bài bộ đề tự học tương lai chưa đụng tới để không làm tràn Trang chủ
 * và ClassCard, nhưng vẫn hiển thị ngay bài bộ đề học viên đã bắt đầu hoặc
 * đã nộp sớm (`submitted_at` hoặc có `quiz_attempt`).
 */
export function overviewAssignmentFilter(
	now: Date = new Date(),
): SQL | undefined {
	return or(
		isNull(classAssignment.availableAt),
		lte(classAssignment.availableAt, now),
		and(
			isNotNull(classAssignment.classStudyPackId),
			or(
				isNotNull(classAssignmentTarget.submittedAt),
				isNotNull(quizAttempt.id),
			),
		),
	);
}
