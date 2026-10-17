import type { AnswerResult } from "@teacher-os/api/srs/quiz-generator";
import { Button } from "@teacher-os/ui/components/button";
import { CheckIcon, XIcon } from "lucide-react";

export function VocabFeedbackPanel({
	result,
	word,
	ipa,
	translation,
	persistStatus,
	onContinue,
	onRetryPersist,
	onDiscardPersist,
}: {
	result: AnswerResult;
	word: string;
	ipa: string | null;
	translation: string;
	persistStatus: "idle" | "saving" | "error";
	onContinue: () => void;
	onRetryPersist: () => void;
	onDiscardPersist: () => void;
}) {
	const isCorrect = result === "correct";
	const isContinueBlocked = persistStatus !== "idle";

	return (
		<div
			data-testid="vocab-feedback-panel"
			className={`neu mt-6 rounded-md border-l-4 p-5 ${
				isCorrect
					? "border-l-[var(--verdict-correct)] bg-[var(--verdict-correct-soft)]"
					: "border-l-[var(--verdict-wrong)] bg-[var(--verdict-wrong-soft)]"
			}`}
		>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<div className="flex items-center gap-2">
						{isCorrect ? (
							<CheckIcon
								aria-hidden="true"
								className="size-4 text-[var(--verdict-correct)]"
							/>
						) : (
							<XIcon
								aria-hidden="true"
								className="size-4 text-[var(--verdict-wrong)]"
							/>
						)}
						<span
							data-testid="vocab-feedback-verdict"
							className={`font-mono font-semibold text-xs uppercase tracking-[0.15em] ${
								isCorrect
									? "text-[var(--verdict-correct)]"
									: "text-[var(--verdict-wrong)]"
							}`}
						>
							{isCorrect
								? "Chính xác"
								: result === "forgot"
									? "Chưa nhớ"
									: "Chưa đúng"}
						</span>
					</div>

					<p className="mt-2 font-display font-extrabold text-fg text-xl">
						{word}
						{ipa ? (
							<span className="ml-2 font-mono font-normal text-meta text-sm">
								{ipa}
							</span>
						) : null}
					</p>
					<p className="mt-1 text-fg text-sm">{translation}</p>
				</div>

				<Button
					type="button"
					data-testid="vocab-continue-btn"
					disabled={isContinueBlocked}
					onClick={onContinue}
				>
					{persistStatus === "saving" ? "Đang lưu…" : "Tiếp tục"}
				</Button>
			</div>

			{persistStatus === "error" ? (
				<div
					role="alert"
					data-testid="vocab-persist-error"
					className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3"
				>
					<p className="text-hot text-xs">
						Không lưu được kết quả học do lỗi kết nối. Bạn có thể thử lại để giữ
						nguyên tiến độ.
					</p>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							data-testid="vocab-retry-btn"
							onClick={onRetryPersist}
						>
							Thử lại
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							data-testid="vocab-discard-btn"
							onClick={onDiscardPersist}
						>
							Bỏ qua
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
