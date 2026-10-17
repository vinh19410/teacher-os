import type { QuizPrompt } from "@teacher-os/api/srs/quiz-generator";
import { Button } from "@teacher-os/ui/components/button";
import { Input } from "@teacher-os/ui/components/input";
import { type FormEvent, useState } from "react";

export function PromptTyping({
	translation,
	prompt,
	disabled,
	onSubmitTyped,
	onForgot,
}: {
	translation: string;
	prompt: QuizPrompt;
	disabled: boolean;
	onSubmitTyped: (typed: string) => void;
	onForgot: () => void;
}) {
	const [typed, setTyped] = useState("");

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (disabled || typed.trim().length === 0) return;
		onSubmitTyped(typed);
	};

	return (
		<form
			onSubmit={handleSubmit}
			data-testid="vocab-prompt-typing"
			className="space-y-6"
		>
			<div className="neu rounded-md p-6 text-center">
				<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
					Gõ từ tiếng Anh tương ứng
				</p>
				<p
					data-testid="vocab-prompt-question"
					className="mt-3 font-display font-extrabold text-2xl text-fg tracking-[-0.02em]"
				>
					{translation}
				</p>
				{prompt.hint.length > 0 ? (
					<p
						data-testid="vocab-typing-hint"
						className="mt-3 font-mono text-lg text-meta tracking-[0.2em]"
					>
						{prompt.hint}
					</p>
				) : null}
			</div>

			<div className="flex flex-col gap-3 sm:flex-row">
				<Input
					data-testid="vocab-typing-input"
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					disabled={disabled}
					placeholder="Nhập từ vựng..."
					aria-label="Nhập từ vựng"
					autoComplete="off"
					autoCapitalize="none"
					spellCheck={false}
					className="flex-1"
				/>
				<Button
					type="submit"
					data-testid="vocab-typing-submit"
					disabled={disabled || typed.trim().length === 0}
				>
					Kiểm tra
				</Button>
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
		</form>
	);
}
