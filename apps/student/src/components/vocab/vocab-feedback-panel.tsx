import type { AnswerResult } from "@teacher-os/api/srs/quiz-generator";
import { Button } from "@teacher-os/ui/components/button";
import { CheckIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function formatPos(pos?: string | null): string | null {
	const trimmed = pos?.trim();
	if (!trimmed) return null;
	return trimmed.startsWith("(") && trimmed.endsWith(")")
		? trimmed
		: `(${trimmed})`;
}

export function VocabFeedbackPanel({
	result,
	word,
	ipa,
	translation,
	entryType,
	pos,
	example,
	persistStatus,
	onContinue,
	onRetryPersist,
	onDiscardPersist,
}: {
	result: AnswerResult;
	word: string;
	ipa: string | null;
	translation: string;
	entryType?: "word" | "chunk";
	pos?: string | null;
	example?: string | null;
	persistStatus: "idle" | "saving" | "error";
	onContinue: () => void;
	onRetryPersist: () => void;
	onDiscardPersist: () => void;
}) {
	const isCorrect = result === "correct";
	const isContinueBlocked = persistStatus !== "idle";
	const formattedPos = formatPos(pos);
	const trimmedExample = example?.trim() || null;

	return (
		<div
			data-testid="vocab-feedback-panel"
			className={`mt-6 rounded-md rounded-xl border border-l-4 bg-card p-5 shadow-sm ${
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

					<div className="mt-2 flex flex-wrap items-center gap-2">
						<span className="font-extrabold text-foreground text-xl">
							{word}
						</span>
						{entryType === "chunk" ? (
							<Badge
								variant="secondary"
								data-testid="vocab-feedback-entry-type"
							>
								Chunk
							</Badge>
						) : entryType === "word" ? (
							<Badge variant="outline" data-testid="vocab-feedback-entry-type">
								Word
							</Badge>
						) : null}
						{formattedPos ? (
							<span
								data-testid="vocab-feedback-pos"
								className="font-mono text-muted-foreground text-xs"
							>
								{formattedPos}
							</span>
						) : null}
						{ipa ? (
							<span className="font-mono font-normal text-muted-foreground text-sm">
								{ipa}
							</span>
						) : null}
					</div>
					<p className="mt-1 text-foreground text-sm">{translation}</p>
					{trimmedExample ? (
						<p
							data-testid="vocab-feedback-example"
							className="mt-1 text-muted-foreground text-xs italic"
						>
							Ví dụ: {trimmedExample}
						</p>
					) : null}
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
					className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted px-4 py-3"
				>
					<p className="text-primary text-xs">
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
