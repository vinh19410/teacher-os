import { Button } from "@teacher-os/ui/components/button";

export function PromptSelfCheck({
	word,
	ipa,
	translation,
	isRevealed,
	disabled,
	onReveal,
	onRemembered,
	onForgot,
}: {
	word: string;
	ipa: string | null;
	translation: string;
	isRevealed: boolean;
	disabled: boolean;
	onReveal: () => void;
	onRemembered: () => void;
	onForgot: () => void;
}) {
	return (
		<div data-testid="vocab-prompt-selfCheck" className="space-y-6">
			<div className="neu rounded-md p-6 text-center">
				<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
					Tự kiểm tra trí nhớ
				</p>
				<p
					data-testid="vocab-prompt-question"
					className="mt-3 font-display font-extrabold text-3xl text-fg tracking-[-0.03em]"
				>
					{word}
				</p>
				{ipa ? <p className="mt-1 font-mono text-meta text-sm">{ipa}</p> : null}

				{isRevealed ? (
					<div className="mt-6 border-line border-t pt-4">
						<p className="font-mono text-[11px] text-meta uppercase tracking-[0.15em]">
							Nghĩa
						</p>
						<p
							data-testid="vocab-selfcheck-translation"
							className="mt-1 font-semibold text-fg text-lg"
						>
							{translation}
						</p>
					</div>
				) : null}
			</div>

			{!isRevealed ? (
				<div className="flex justify-center">
					<Button
						type="button"
						data-testid="vocab-reveal-btn"
						disabled={disabled}
						onClick={onReveal}
					>
						Lật thẻ xem nghĩa
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap justify-center gap-3">
					<Button
						type="button"
						variant="outline"
						data-testid="vocab-self-forgot"
						disabled={disabled}
						onClick={onForgot}
					>
						Mình quên
					</Button>
					<Button
						type="button"
						data-testid="vocab-self-remembered"
						disabled={disabled}
						onClick={onRemembered}
					>
						Mình nhớ
					</Button>
				</div>
			)}
		</div>
	);
}
