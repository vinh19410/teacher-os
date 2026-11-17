import { stripInlineCefrLabel } from "@teacher-os/api/placement-test-contracts";
import { Input } from "@teacher-os/ui/components/input";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { PLACEMENT_OPTION_LETTERS } from "@/lib/placement-test-helpers";

export function PlacementMcqQuestionCard({
	questionId,
	questionNumber,
	prompt,
	options,
	value,
	onChange,
	kindBadge,
}: {
	questionId: string;
	questionNumber: number;
	prompt: string;
	options: readonly string[];
	value: number | null | undefined;
	onChange: (optionIndex: number) => void;
	kindBadge?: string;
}) {
	const cleanPrompt = stripInlineCefrLabel(prompt);

	return (
		<fieldset
			data-question-id={questionId}
			className="space-y-3 rounded-xl border bg-card p-4 shadow-xs"
		>
			<legend className="contents">
				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono font-semibold text-foreground text-xs tabular-nums">
						Câu {questionNumber}
					</span>
					{kindBadge ? (
						<span className="inline-flex items-center rounded-md border px-2 py-0.5 text-muted-foreground text-xs">
							{kindBadge}
						</span>
					) : null}
				</div>
				<p className="font-medium text-foreground text-sm leading-relaxed">
					{cleanPrompt || (
						<span className="text-muted-foreground">
							Chọn đáp án đúng nhất:
						</span>
					)}
				</p>
			</legend>

			<div className="grid gap-2">
				{options.map((optText, optIdx) => {
					const inputId = `opt-${questionId}-${optIdx}`;
					const isSelected = value === optIdx;
					const letter = PLACEMENT_OPTION_LETTERS[optIdx] ?? String(optIdx + 1);
					return (
						<label
							key={inputId}
							htmlFor={inputId}
							className={cn(
								"flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
								isSelected
									? "border-primary bg-muted text-foreground ring-1 ring-primary"
									: "border-input bg-background text-foreground hover:bg-accent",
							)}
						>
							<input
								type="radio"
								id={inputId}
								name={`placement-q-${questionId}`}
								value={optIdx}
								checked={isSelected}
								onChange={() => onChange(optIdx)}
								className="sr-only"
							/>
							<span
								aria-hidden="true"
								className={cn(
									"flex size-6 shrink-0 items-center justify-center rounded-full border font-mono font-semibold text-xs",
									isSelected
										? "border-primary bg-primary text-primary-foreground"
										: "border-input bg-muted/50 text-muted-foreground",
								)}
							>
								{letter}
							</span>
							<span className="min-w-0 flex-1 break-words">{optText}</span>
							{isSelected ? (
								<Check
									aria-hidden="true"
									className="size-4 shrink-0 text-primary"
								/>
							) : null}
						</label>
					);
				})}
			</div>
		</fieldset>
	);
}

export function PlacementGapQuestionCard({
	questionId,
	questionNumber,
	prompt,
	value,
	onChange,
}: {
	questionId: string;
	questionNumber: number;
	prompt: string;
	value: string;
	onChange: (next: string) => void;
}) {
	const inputId = `gap-${questionId}`;
	const cleanPrompt = stripInlineCefrLabel(prompt);

	return (
		<fieldset
			data-question-id={questionId}
			className="space-y-3 rounded-xl border bg-card p-4 shadow-xs"
		>
			<legend className="contents">
				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono font-semibold text-foreground text-xs tabular-nums">
						Câu {questionNumber}
					</span>
					<span className="inline-flex items-center rounded-md border px-2 py-0.5 text-muted-foreground text-xs">
						Điền từ / số
					</span>
				</div>
				<p className="font-medium text-foreground text-sm leading-relaxed">
					{cleanPrompt || "Điền thông tin nghe được vào chỗ trống:"}
				</p>
			</legend>

			<div className="space-y-1.5">
				<label htmlFor={inputId} className="sr-only">
					Câu {questionNumber}: {cleanPrompt || "Điền đáp án"}
				</label>
				<Input
					id={inputId}
					type="text"
					value={value}
					maxLength={120}
					autoComplete="off"
					spellCheck={false}
					placeholder="Nhập từ hoặc số bạn nghe được..."
					onChange={(e) => onChange(e.target.value)}
				/>
				<p className="text-muted-foreground text-xs">
					Gợi ý: Viết ngắn gọn (không cần viết hoa hay ký tự phụ như $, p.m.).
				</p>
			</div>
		</fieldset>
	);
}
