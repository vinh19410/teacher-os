import type { ExamImportDuplicate } from "@teacher-os/api/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Thanh thông báo phát hiện đề trùng (TOS-25 #471, plan D5 — wireframe mục
 * 3–4): khối Alert `role="status"` kèm nút "Mở lại bản nháp cũ (0 Cr)".
 * KHÔNG tự điều hướng — caller điều khiển qua `onReopen` (màn import navigate
 * `?job=<jobId>`). `title` do server fallback sẵn (draft → fileName), có thể
 * null với row lạ → hiển thị câu không nêu tên đề.
 */
export function DuplicateExamBanner({
	duplicate,
	onReopen,
}: {
	duplicate: ExamImportDuplicate;
	onReopen: () => void;
}) {
	const parsedDate = duplicate.completedAt
		? new Date(duplicate.completedAt)
		: null;
	const date =
		parsedDate && !Number.isNaN(parsedDate.getTime())
			? parsedDate.toLocaleDateString("vi-VN")
			: null;
	const detail = duplicate.title
		? `với đề "${duplicate.title}"${date ? ` đã bóc tách ngày ${date}` : ""}.`
		: `với một đề đã bóc tách trước đó${date ? ` ngày ${date}` : ""}.`;
	return (
		<div data-testid="duplicate-exam-banner" className="mb-4">
			<Alert title="Phát hiện tệp trùng mã băm">
				<p>{detail}</p>
				<Button
					variant="secondary"
					size="sm"
					className="mt-2"
					onClick={onReopen}
					data-testid="duplicate-reopen-button"
				>
					Mở lại bản nháp cũ (0 Cr)
				</Button>
			</Alert>
		</div>
	);
}
