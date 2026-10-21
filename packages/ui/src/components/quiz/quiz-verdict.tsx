import type { QuizVerdict } from "@teacher-os/api/contracts";
import { cn } from "@teacher-os/ui/lib/utils";

/**
 * Nguồn style verdict duy nhất của màn soi bài/chấm điểm (issue #351) — thay
 * 3 map trùng lặp từng nằm ở quiz-review-item / quiz-navigator /
 * attempt-compact-list. Token `--verdict-*` là ngoại lệ có chủ đích của hệ
 * đơn sắc + cam (DESIGN.md → Tokens): chỉ dùng cho chấm/soi bài, luôn kèm
 * icon ✓/✗ để tín hiệu không phụ thuộc màu. Take mode không dùng map nào ở
 * đây.
 */

/** SVG 1 nét (không phải ký tự) để toHaveText của chip không lẫn icon. */
export function VerdictIcon({
	verdict,
	className,
}: {
	verdict: QuizVerdict;
	className?: string;
}) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={cn("size-3.5 shrink-0", className)}
		>
			{verdict === "correct" && <path d="M2 6.5 5 9.5 10 3.5" />}
			{verdict === "wrong" && <path d="M3 3l6 6M9 3l-6 6" />}
			{verdict === "skipped" && <path d="M3 6h6" />}
		</svg>
	);
}

/** Khối câu: viền trái 3px + nền nhạt theo verdict; skipped viền đứt meta. */
export const VERDICT_BLOCK_CLASSES: Record<QuizVerdict, string> = {
	correct: "border-l-[3px] border-l-verdict-correct bg-verdict-correct-soft",
	wrong: "border-l-[3px] border-l-verdict-wrong bg-verdict-wrong-soft",
	skipped: "border-l-[3px] border-l-meta border-dashed bg-transparent",
};

/** Chip verdict (pill cạnh số câu): viền + nền soft + chữ theo verdict. */
export const VERDICT_CHIP_CLASSES: Record<QuizVerdict, string> = {
	correct:
		"border-verdict-correct/50 bg-verdict-correct-soft text-verdict-correct",
	wrong: "border-verdict-wrong/50 bg-verdict-wrong-soft text-verdict-wrong",
	skipped: "border-dashed border-line-strong text-muted-fg",
};

/** Nút navigator: nền đặc theo verdict, chữ --verdict-on. */
export const VERDICT_SOLID_CLASSES: Record<QuizVerdict, string> = {
	correct: "border-transparent bg-verdict-correct text-verdict-on",
	wrong: "border-transparent bg-verdict-wrong text-verdict-on",
	skipped: "border-dashed border-line-strong bg-surface text-muted-fg",
};

/** Chữ theo verdict (compact list, đáp án key...). */
export const VERDICT_TEXT_CLASSES: Record<QuizVerdict, string> = {
	correct: "text-verdict-correct",
	wrong: "text-verdict-wrong",
	skipped: "text-muted-fg",
};

/** accent-color cho radio theo verdict (take giữ accent-hot). */
export const VERDICT_ACCENT_CLASSES: Record<QuizVerdict, string> = {
	correct: "accent-verdict-correct",
	wrong: "accent-verdict-wrong",
	skipped: "accent-meta",
};

/**
 * Icon góc trên nút navigator (nền chấm = --bg): stroke phải là MÀU VERDICT —
 * nếu kế thừa currentColor của chữ nút (--verdict-on == --bg) thì icon
 * vô hình ở cả 2 theme (code review PR #355 F1).
 */
export const VERDICT_BADGE_CLASSES: Record<QuizVerdict, string> = {
	correct: "text-verdict-correct",
	wrong: "text-verdict-wrong",
	skipped: "text-meta",
};
