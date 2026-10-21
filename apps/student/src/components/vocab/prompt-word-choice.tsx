import type { QuizPrompt } from "@teacher-os/api/srs/quiz-generator";
import { Button } from "@teacher-os/ui/components/button";

export function PromptWordChoice({
	translation,
	prompt,
	disabled,
	selectedOption,
	onSelectOption,
	onForgot,
}: {
	translation: string;
	prompt: QuizPrompt;
	disabled: boolean;
	selectedOption: string | null;
	onSelectOption: (option: string) => void;
	onForgot: () => void;
}) {
	return (
		<div data-testid="vocab-prompt-wordChoice" className="space-y-6">
			<div className="rounded-md rounded-xl border bg-card p-6 text-center shadow-sm">
				<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
					Chọn từ tiếng Anh tương ứng
				</p>
				<p
					data-testid="vocab-prompt-question"
					className="mt-3 font-extrabold text-2xl text-foreground tracking-[-0.02em]"
				>
					{translation}
				</p>
			</div>

			<div
				role="group"
				aria-label="Các lựa chọn từ vựng"
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
