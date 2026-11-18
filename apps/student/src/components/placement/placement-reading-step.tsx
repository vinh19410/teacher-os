import {
	type PlacementPublishedReadingPassage,
	stripInlineCefrLabel,
} from "@teacher-os/api/placement-test-contracts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@teacher-os/ui/components/card";
import { Fragment, useMemo } from "react";
import { PlacementMcqQuestionCard } from "@/components/placement/placement-question-card";
import { cn } from "@/lib/cn";
import { groupPlacementItemsByPart } from "@/lib/placement-test-helpers";

function normalizeReadingKind(kind: unknown): string {
	return (
		String(kind ?? "passage")
			.trim()
			.toLowerCase() || "passage"
	);
}

function ReadingPassageBody({
	passage,
}: {
	passage: PlacementPublishedReadingPassage;
}) {
	const normalizedKind = normalizeReadingKind(passage.kind);
	const paragraphs = passage.body.split(/\n{2,}/);
	const bodyStyle =
		normalizedKind === "sign"
			? "border-2 border-warn/40 bg-warn-soft/50"
			: normalizedKind === "message"
				? "border-2 border-class-1/35 bg-class-1-soft/45"
				: "border border-l-4 border-l-primary bg-card";

	return (
		<div
			data-passage-kind={normalizedKind}
			className={cn(
				"space-y-3 rounded-lg p-4 text-foreground text-sm leading-[1.85]",
				bodyStyle,
			)}
		>
			{paragraphs.map((para, pIdx) => {
				if (normalizedKind === "cloze") {
					const segments = para.split(/(\[\d+\])/g);
					return (
						<p key={`p-${pIdx}`}>
							{segments.map((seg, sIdx) => {
								const match = /^\[(\d+)\]$/.exec(seg);
								if (match) {
									return (
										<span
											key={`b-${pIdx}-${sIdx}`}
											className="mx-1 inline-flex items-center rounded border border-primary/40 bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground text-xs"
										>
											({match[1]})
										</span>
									);
								}
								return <Fragment key={`t-${pIdx}-${sIdx}`}>{seg}</Fragment>;
							})}
						</p>
					);
				}

				const lines = para.split("\n");
				return (
					<p key={`p-${pIdx}`}>
						{lines.map((line, lIdx) => (
							<Fragment key={`l-${pIdx}-${lIdx}`}>
								{lIdx > 0 ? <br /> : null}
								{line}
							</Fragment>
						))}
					</p>
				);
			})}
		</div>
	);
}

export function PlacementReadingStep({
	title,
	passages,
	questionNumbers,
	answers,
	onAnswerChange,
}: {
	title: string;
	passages: readonly PlacementPublishedReadingPassage[];
	questionNumbers: ReadonlyMap<string, number>;
	answers: Readonly<Record<string, number | null>>;
	onAnswerChange: (questionId: string, optionIndex: number) => void;
}) {
	const partGroups = useMemo(
		() => groupPlacementItemsByPart(passages),
		[passages],
	);

	return (
		<div className="space-y-6" data-testid="placement-step-reading">
			<Card>
				<CardHeader>
					<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
						Phần 3 / 5 · Đọc hiểu
					</CardDescription>
					<CardTitle className="text-xl">
						{stripInlineCefrLabel(title) || "Reading Comprehension"}
					</CardTitle>
					<CardDescription>
						Đọc kỹ từng biển báo, tin nhắn, bài đọc và đoạn điền từ bên dưới rồi
						chọn đáp án đúng.
					</CardDescription>
				</CardHeader>
			</Card>

			{partGroups.length === 0 ? (
				<Card>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Phần Reading hiện chưa có bài đọc nào. Bạn có thể chuyển sang bước
							tiếp theo.
						</p>
					</CardContent>
				</Card>
			) : (
				partGroups.map((group, gIdx) => (
					<section
						key={`reading-part-${gIdx}-${group.partLabel}`}
						className="space-y-4"
					>
						{group.partLabel || group.instruction ? (
							<div className="space-y-1.5 px-1">
								{group.partLabel ? (
									<div>
										<span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 font-semibold text-foreground text-xs">
											{group.partLabel}
										</span>
									</div>
								) : null}
								{group.instruction ? (
									<p className="text-muted-foreground text-sm leading-relaxed">
										{group.instruction}
									</p>
								) : null}
							</div>
						) : null}

						<div className="space-y-4">
							{group.items.map(({ item: passage }) => {
								const normalizedKind = normalizeReadingKind(passage.kind);
								const isSignOrMessage =
									normalizedKind === "sign" || normalizedKind === "message";
								const passageTitle = stripInlineCefrLabel(passage.title);
								const showHeader = !isSignOrMessage && Boolean(passageTitle);
								return (
									<Card key={passage.id} data-passage-id={passage.id}>
										{showHeader ? (
											<CardHeader className="pb-3">
												<CardTitle className="text-lg">
													{passageTitle}
												</CardTitle>
											</CardHeader>
										) : null}

										<CardContent className="space-y-5">
											{passage.body.trim() ? (
												<ReadingPassageBody passage={passage} />
											) : null}

											<div className="space-y-4">
												{passage.questions.map((q) => (
													<PlacementMcqQuestionCard
														key={q.id}
														questionId={q.id}
														questionNumber={questionNumbers.get(q.id) ?? 1}
														prompt={q.prompt}
														options={q.options}
														value={answers[q.id] ?? null}
														onChange={(optIdx) => onAnswerChange(q.id, optIdx)}
													/>
												))}
											</div>
										</CardContent>
									</Card>
								);
							})}
						</div>
					</section>
				))
			)}
		</div>
	);
}
