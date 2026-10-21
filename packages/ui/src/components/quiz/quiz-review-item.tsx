import type { QuizVerdict } from "@teacher-os/api/contracts";
import {
	VERDICT_CHIP_CLASSES,
	VerdictIcon,
} from "@teacher-os/ui/components/quiz/quiz-verdict";
import { cn } from "@teacher-os/ui/lib/utils";

/** Dữ liệu review 1 câu (từ detail payload — key/verdict chỉ có sau nộp). */
export interface QuizReviewInfo {
	verdict: QuizVerdict;
	/** Đáp án đúng (canonical — grader so normalize với đáp án học viên). */
	key: string;
	/** Các đáp án thay thế, phân tách " / " (ALT_SEPARATOR của grader). */
	alts: string;
	/** Đáp án học viên — null = bỏ qua. */
	answer: string | null;
	/** Giải thích của đề — withhold ở take, chỉ reveal ở detail. */
	note: string;
}

/**
 * Nội dung chip theo verdict: đúng → nhãn "Đúng"; sai → đáp án học viên
 * (tại sao sai, nhìn ngay); bỏ qua → "Chưa trả lời".
 */
export function quizReviewChipText(
	info: Pick<QuizReviewInfo, "verdict" | "answer">,
): string {
	if (info.verdict === "correct") return "Đúng";
	if (info.verdict === "wrong") return info.answer ?? "Sai";
	return "Chưa trả lời";
}

/**
 * Chip verdict (issue #351): to hơn mức 12px cũ, kèm icon ✓/✗/–, render cạnh
 * số câu trong QuizQuestionItem (review). Token theo VERDICT_CHIP_CLASSES —
 * ngoại lệ chấm điểm của hệ đơn sắc + cam (DESIGN.md).
 */
export function QuizReviewChip({ info }: { info: QuizReviewInfo }) {
	return (
		<span
			data-testid="quiz-review-chip"
			className={cn(
				"inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-1 align-middle font-[590] text-[13px] tracking-tight",
				VERDICT_CHIP_CLASSES[info.verdict],
			)}
		>
			<VerdictIcon verdict={info.verdict} className="size-3.5" />
			{/* truncate phải nằm trên text node — flex item ẩn danh không có
				ellipsis (cùng pattern với attempt-compact-list). */}
			<span className="truncate">{quizReviewChipText(info)}</span>
		</span>
	);
}

/**
 * Khối review chèn dưới mỗi câu ở detail screen: dòng "Đáp án: X — thay thế:
 * a / b" (+ "Bạn trả lời" khi sai) + disclosure "Giải thích" (native
 * <details>, không cần JS). Chip verdict render ở dòng số câu — khối này chỉ
 * giữ metadata. Render trong fieldset disabled của câu nên không cần tự khóa
 * input.
 */
export function QuizReviewItem({ info }: { info: QuizReviewInfo }) {
	const alts = info.alts
		.split(" / ")
		.map((alt) => alt.trim())
		.filter(Boolean);
	return (
		<div
			data-testid="quiz-review-item"
			data-verdict={info.verdict}
			className="mt-2 border-line-soft border-t pt-2 text-[13px]"
		>
			<p className="text-muted-fg">
				Đáp án:{" "}
				<span className="font-medium font-mono text-verdict-correct">
					{info.key}
				</span>
				{alts.length > 0 && (
					<>
						{" — thay thế: "}
						<span className="font-mono text-fg">{alts.join(" / ")}</span>
					</>
				)}
			</p>
			{info.verdict === "wrong" && info.answer !== null && (
				<p className="mt-1 text-muted-fg">
					Bạn trả lời:{" "}
					<span className="font-mono text-verdict-wrong line-through">
						{info.answer}
					</span>
				</p>
			)}
			{info.note.trim().length > 0 && (
				<details className="mt-1.5">
					<summary className="cursor-pointer select-none font-medium text-hot">
						Giải thích
					</summary>
					<p className="mt-1 whitespace-pre-wrap text-muted-fg leading-[1.55]">
						{info.note}
					</p>
				</details>
			)}
		</div>
	);
}
