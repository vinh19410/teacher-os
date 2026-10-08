import type { QuizVerdict } from "@teacher-os/api/contracts";
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

/** Chip verdict: đúng = success token, sai = danger, bỏ qua = muted. */
export const QUIZ_REVIEW_CHIP_CLASSES: Record<QuizVerdict, string> = {
	correct: "border-success/40 bg-success-soft text-success",
	wrong: "border-danger/40 bg-danger-soft text-danger",
	skipped: "border-line bg-surface text-muted-fg",
};

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
 * Khối review chèn dưới mỗi câu ở detail screen: chip verdict + dòng "Đáp án:
 * X — thay thế: a / b" + disclosure "Giải thích" (native <details>, không cần
 * JS). Render trong fieldset disabled của câu nên không cần tự khóa input.
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
			className="mt-2 rounded-md border border-line-soft bg-surface px-3 py-2 text-[13px]"
		>
			<span
				data-testid="quiz-review-chip"
				className={cn(
					"inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 font-[590] text-[12px] tracking-tight",
					QUIZ_REVIEW_CHIP_CLASSES[info.verdict],
				)}
			>
				{quizReviewChipText(info)}
			</span>
			<p className="mt-1.5 text-muted-fg">
				Đáp án:{" "}
				<span className="font-medium font-mono text-fg">{info.key}</span>
				{alts.length > 0 && (
					<>
						{" — thay thế: "}
						<span className="font-mono text-fg">{alts.join(" / ")}</span>
					</>
				)}
			</p>
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
