import type { QuizPrompt } from "@teacher-os/api/srs/quiz-generator";
import { Button } from "@teacher-os/ui/components/button";

export function PromptMeaningChoice({
	word,
	ipa,
	prompt,
	disabled,
	selectedOption,
	onSelectOption,
	onForgot,
}: {
	word: string;
	ipa: string | null;
	prompt: QuizPrompt;
	disabled: boolean;
	selectedOption: string | null;
	onSelectOption: (option: string) => void;
	onForgot: () => void;
}) {
	return (
		<div data-testid="vocab-prompt-meaningChoice" className="space-y-6">
			<div className="rounded-md rounded-xl border bg-card p-6 text-center shadow-sm">
				<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
					Chọn nghĩa đúng
				</p>
				<p
					data-testid="vocab-prompt-question"
					className="mt-3 font-extrabold text-3xl text-foreground tracking-[-0.03em]"
				>
					{word}
				</p>
				{ipa ? (
					<p className="mt-1 font-mono text-muted-foreground text-sm">{ipa}</p>
				) : null}
			</div>

			<div
				role="group"
				aria-label="Các lựa chọn nghĩa"
				className="grid grid-cols-1 gap-3 sm:grid-cols-2"
			>
				{prompt.options.map((opt) => {
					const isSelected = selectedOption === opt;
					return (
						<button
							key={opt}
							type="button"
							data-testid="vocab-option"
							disabled={disabled}
							onClick={() => onSelectOption(opt)}
							className={`rounded-md px-4 py-3.5 text-left font-medium text-sm transition-colors duration-150 ${
								isSelected
									? "rounded-md bg-muted text-primary"
									: "rounded-md border border-input bg-transparent text-foreground hover:border-primary"
							} disabled:pointer-events-none disabled:opacity-60`}
						>
							{opt}
						</button>
					);
				})}
			</div>

			<div className="flex justify-center">
				<Button
					type="button"
					variant="ghost"
					data-testid="vocab-forgot-btn"
					disabled={disabled}
					onClick={onForgot}
				>
					Mình không nhớ
				</Button>
			</div>
		</div>
	);
}
