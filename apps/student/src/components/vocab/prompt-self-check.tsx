import { Button } from "@teacher-os/ui/components/button";
import { Badge } from "@/components/ui/badge";

function formatPos(pos?: string | null): string | null {
	const trimmed = pos?.trim();
	if (!trimmed) return null;
	return trimmed.startsWith("(") && trimmed.endsWith(")")
		? trimmed
		: `(${trimmed})`;
}

export function PromptSelfCheck({
	word,
	ipa,
	translation,
	entryType,
	pos,
	example,
	isRevealed,
	disabled,
	onReveal,
	onRemembered,
	onForgot,
}: {
	word: string;
	ipa: string | null;
	translation: string;
	entryType?: "word" | "chunk";
	pos?: string | null;
	example?: string | null;
	isRevealed: boolean;
	disabled: boolean;
	onReveal: () => void;
	onRemembered: () => void;
	onForgot: () => void;
}) {
	const formattedPos = formatPos(pos);
	const trimmedExample = example?.trim() || null;

	return (
		<div data-testid="vocab-prompt-selfCheck" className="space-y-6">
			<div className="rounded-md rounded-xl border bg-card p-6 text-center shadow-sm">
				<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
					Tự kiểm tra trí nhớ
				</p>
				<p
					data-testid="vocab-prompt-question"
					className="mt-3 font-extrabold text-3xl text-foreground tracking-[-0.03em]"
				>
					{word}
				</p>
				{entryType === "word" || entryType === "chunk" || formattedPos ? (
					<div className="mt-2 flex flex-wrap items-center justify-center gap-2">
						{entryType === "chunk" ? (
							<Badge
								variant="secondary"
								data-testid="vocab-selfcheck-entry-type"
							>
								Chunk
							</Badge>
						) : entryType === "word" ? (
							<Badge variant="outline" data-testid="vocab-selfcheck-entry-type">
								Word
							</Badge>
						) : null}
						{formattedPos ? (
							<span
								data-testid="vocab-selfcheck-pos"
								className="font-mono text-muted-foreground text-xs"
							>
								{formattedPos}
							</span>
						) : null}
					</div>
				) : null}
				{ipa ? (
					<p className="mt-1 font-mono text-muted-foreground text-sm">{ipa}</p>
				) : null}

				{isRevealed ? (
					<div className="mt-6 border-border border-t pt-4">
						<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
							Nghĩa
						</p>
						<p
							data-testid="vocab-selfcheck-translation"
							className="mt-1 font-semibold text-foreground text-lg"
						>
							{translation}
						</p>
						{trimmedExample ? (
							<div className="mt-3">
								<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
									Ví dụ
								</p>
								<p
									data-testid="vocab-selfcheck-example"
									className="mt-1 text-muted-foreground text-sm italic"
								>
									{trimmedExample}
								</p>
							</div>
						) : null}
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
