import type { QuizAttemptItem } from "@teacher-os/api/contracts";
import {
	VERDICT_TEXT_CLASSES,
	VerdictIcon,
} from "@teacher-os/ui/components/quiz/quiz-verdict";
import { cn } from "@teacher-os/ui/lib/utils";

/**
 * List compact per câu (Selfomy parity): `n → icon verdict → đáp án học viên
 * ("—" nếu bỏ) → Đáp án: X`, đáp án học viên tô/gạch theo verdict, key xanh
 * khi có chấm (issue #351).
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
			className="neu overflow-hidden rounded-md"
		>
			{items.map((item, index) => (
				<li
					key={index}
					className="flex items-center gap-3 border-line-soft border-b px-4 py-2 text-sm last:border-b-0"
				>
					<span className="w-6 shrink-0 text-right font-mono text-meta">
						{index + 1}
					</span>
					<span
						data-verdict={item.verdict}
						className={cn(
							"inline-flex min-w-0 flex-1 items-center gap-1.5 font-medium",
							VERDICT_TEXT_CLASSES[item.verdict],
							item.verdict === "wrong" && "line-through",
						)}
					>
						<VerdictIcon verdict={item.verdict} className="size-3" />
						{/* truncate phải nằm trên text node (flex item ẩn danh không
							có ellipsis) — giữ hành vi cắt "…" như trước #351. */}
						<span className="truncate">{item.answer ?? "—"}</span>
					</span>
					<span
						className={cn(
							"shrink-0 font-mono text-[13px]",
							item.verdict !== "skipped" ? "text-verdict-correct" : "text-fg-2",
						)}
					>
						Đáp án: {item.key}
					</span>
				</li>
			))}
			{items.length === 0 && (
				<li className="px-4 py-3 text-meta text-sm">
					Đề này không có câu hỏi tự chấm.
				</li>
			)}
		</ul>
	);
}
