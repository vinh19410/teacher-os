import {
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
	type ExamImportFailReason,
} from "@teacher-os/api/contracts";
import { Button } from "@/components/ui/button";

/** Nhãn lý do E-004 hiển thị dưới thông điệp chính — giúp người dùng hiểu
 * vì sao phải thử lại (timeout/AI lỗi/tệp không đọc được cấu trúc). */
const FAIL_REASON_LABELS: Record<ExamImportFailReason, string> = {
	timeout: "Quá thời gian chờ 120 giây.",
	ai_error: "Dịch vụ AI gặp lỗi khi bóc tách.",
	empty_result: "AI không đọc được nhóm câu hỏi hợp lệ nào từ tệp.",
};

/**
 * Panel lỗi E-004 (TOS-27 phase-02): Credit tạm giữ ĐÃ hoàn đủ về ví +
 * nút "Thử bóc tách lại AI" tạo job mới dùng lại file (không upload lại).
 * Text thông điệp là nguyên văn spec (EXAM_IMPORT_ERROR_MESSAGES) — contract
 * e2e, đừng đổi riêng ở đây.
 */
export function ImportFailedPanel({
	reason,
	retrying,
	onRetry,
}: {
	reason: ExamImportFailReason | null;
	retrying?: boolean;
	onRetry: () => void;
}) {
	return (
		<div
			role="alert"
			data-testid="exam-import-failed-panel"
			className="mb-4 rounded-lg border border-warn bg-warn/10 p-4"
		>
			<p className="text-sm">
				{EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.EXAM_FAILED]}
			</p>
			{reason && (
				<p className="mt-1 font-medium text-muted-foreground text-xs">
					{FAIL_REASON_LABELS[reason]}
				</p>
			)}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="mt-3"
				data-testid="exam-import-retry"
				disabled={retrying}
				onClick={onRetry}
			>
				{retrying ? "Đang tạo lượt thử lại…" : "Thử bóc tách lại AI"}
			</Button>
		</div>
	);
}
