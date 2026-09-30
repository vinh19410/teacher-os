import type { QuizAttemptItem, QuizVerdict } from "@teacher-os/api/contracts";
import { cn } from "@/lib/cn";

const VERDICT_TEXT_CLASSES: Record<QuizVerdict, string> = {
	correct: "text-success",
	wrong: "text-danger",
	skipped: "text-muted-fg",
};

/**
 * List compact per câu (Selfomy parity): `n → đáp án học viên ("—" nếu bỏ)
 * → Đáp án: X`, tô màu đáp án học viên theo verdict.
 */
export function AttemptCompactList({
	items,
}: {
	items: readonly QuizAttemptItem[];
}) {
	return (
		<ul
			data-testid="attempt-compact-list"
			aria-label="Bảng đáp án theo câu"
			className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-bg"
		>
			{items.map((item, index) => (
				<li
					key={index}
					className="flex items-baseline gap-3 border-line-soft border-b px-4 py-2 text-sm last:border-b-0"
				>
					<span className="w-6 shrink-0 text-right font-mono text-muted-fg">
						{index + 1}
					</span>
					<span
						data-verdict={item.verdict}
						className={cn(
							"min-w-0 flex-1 truncate font-medium",
							VERDICT_TEXT_CLASSES[item.verdict],
						)}
					>
						{item.answer ?? "—"}
					</span>
					<span className="shrink-0 font-mono text-[13px] text-fg-2">
						Đáp án: {item.key}
					</span>
				</li>
			))}
			{items.length === 0 && (
				<li className="px-4 py-3 text-muted-fg text-sm">
					Đề này không có câu hỏi tự chấm.
				</li>
			)}
		</ul>
	);
}
