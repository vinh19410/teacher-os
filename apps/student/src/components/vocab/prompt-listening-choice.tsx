import type { QuizPrompt } from "@teacher-os/api/srs/quiz-generator";
import { Button } from "@teacher-os/ui/components/button";
import { Volume2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchVocabAudioObjectUrl } from "@/lib/repos/vocab";
import { VocabPronunciationButtons } from "./vocab-pronunciation-buttons";

export function PromptListeningChoice({
	wordId,
	prompt,
	disabled,
	selectedOption,
	onSelectOption,
	onForgot,
	onSkip,
}: {
	wordId: string;
	prompt: QuizPrompt;
	disabled: boolean;
	selectedOption: string | null;
	onSelectOption: (option: string) => void;
	onForgot: () => void;
	onSkip?: () => void;
}) {
	const [audioUrl, setAudioUrl] = useState<string | null>(null);
	const [audioError, setAudioError] = useState(false);

	useEffect(() => {
		const controller = new AbortController();
		let createdUrl: string | null = null;
		setAudioError(false);
		setAudioUrl(null);

		fetchVocabAudioObjectUrl(wordId, controller.signal)
			.then((url) => {
				if (controller.signal.aborted) {
					URL.revokeObjectURL(url);
					return;
				}
				createdUrl = url;
				setAudioUrl(url);
			})
			.catch(() => {
				if (!controller.signal.aborted) {
					setAudioError(true);
				}
			});

		return () => {
			controller.abort();
			if (createdUrl) {
				URL.revokeObjectURL(createdUrl);
			}
		};
	}, [wordId]);

	return (
		<div data-testid="vocab-prompt-listeningChoice" className="space-y-6">
			<div className="neu flex flex-col items-center gap-4 rounded-md p-6 text-center">
				<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
					Nghe phát âm và chọn từ đúng
				</p>
				{audioUrl ? (
					<VocabPronunciationButtons
						src={audioUrl}
						testIdPrefix="vocab-audio-player"
					/>
				) : (
					<div className="flex items-center gap-3">
						<Volume2Icon aria-hidden className="size-6 text-hot" />
						{audioError ? (
							<span className="font-mono text-meta text-xs">
								Không tải được âm thanh phát âm
							</span>
						) : (
							<span
								data-testid="vocab-audio-loading"
								className="font-mono text-meta text-xs"
							>
								Đang tải âm thanh…
							</span>
						)}
					</div>
				)}
			</div>

			<div
				role="group"
				aria-label="Các lựa chọn từ nghe được"
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
									? "neu-in text-hot"
									: "neu-sm text-fg hover:border-fg"
							} disabled:pointer-events-none disabled:opacity-60`}
						>
							{opt}
						</button>
					);
				})}
			</div>

			<div className="flex justify-center gap-3">
				{audioError && onSkip ? (
					<Button
						type="button"
						variant="outline"
						data-testid="vocab-audio-skip-btn"
						disabled={disabled}
						onClick={onSkip}
					>
						Bỏ qua
					</Button>
				) : null}
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
