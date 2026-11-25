import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import {
	classifyTranscriptInput,
	parseTranscript,
} from "@teacher-os/ui/lib/transcript";
import { cn } from "@teacher-os/ui/lib/utils";
import { useMemo } from "react";

/**
 * Renders a listening transcript cleanly across review surfaces (`QuizPaper`
 * and `StudyPackItemViewer`):
 *
 * - Rich HTML transcripts (authored formatting or potentially unsafe markup)
 *   delegate exclusively to `RichTextBody`, keeping a single DOMPurify sink.
 * - Plain-text and flat `<p>`/`<br>` transcripts are parsed deterministically
 *   into speaker turns and well-spaced paragraphs rendered as safe React text.
 */
export function TranscriptBody({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const model = useMemo(() => {
		const classified = classifyTranscriptInput(text);
		if (classified.kind === "html") {
			return { kind: "html" as const };
		}
		return {
			kind: "plain" as const,
			turns: parseTranscript(classified.text),
		};
	}, [text]);

	if (model.kind === "html") {
		return (
			<RichTextBody
				text={text}
				className={cn(
					"min-w-0 break-words text-foreground/90 leading-[1.7] [&_ol]:my-2 [&_p+p]:mt-2.5 [&_table]:block [&_table]:overflow-x-auto [&_ul]:my-2",
					className,
				)}
			/>
		);
	}

	if (model.turns.length === 0) {
		return null;
	}

	return (
		<div
			className={cn(
				"min-w-0 space-y-3 break-words text-foreground/90 leading-[1.7]",
				className,
			)}
			data-testid="transcript-body"
		>
			{model.turns.map((turn, turnIdx) => {
				const firstParagraph = turn.paragraphs[0] ?? "";
				const turnKey = `turn-${turnIdx}-${turn.speaker ?? "anon"}-${firstParagraph.slice(0, 24)}`;
				return (
					<div
						key={turnKey}
						className="space-y-2"
						data-testid="transcript-turn"
					>
						<p>
							{turn.speaker ? (
								<>
									<span
										className="font-semibold text-foreground"
										data-testid="transcript-speaker"
									>
										{turn.speaker}:
									</span>{" "}
								</>
							) : null}
							{firstParagraph}
						</p>
						{turn.paragraphs.slice(1).map((paragraph, pIdx) => (
							<p key={`${turnKey}-p-${pIdx + 1}-${paragraph.slice(0, 24)}`}>
								{paragraph}
							</p>
						))}
					</div>
				);
			})}
		</div>
	);
}
