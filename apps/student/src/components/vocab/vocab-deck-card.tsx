import { Link } from "@tanstack/react-router";
import type { VocabOverviewDeck } from "@teacher-os/api/contracts";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Check, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
	formatVocabDeckSourceLabel,
	getVocabDeckLearnedCount,
	getVocabDeckProgressPercent,
	isVocabDeckDone,
	VOCAB_MEMORY_LEVELS,
	type VocabMemoryLevel,
} from "./vocab-overview-helpers";

export interface VocabDeckCardProps {
	deck: VocabOverviewDeck;
	activeLevel: VocabMemoryLevel | null;
}

export function VocabDeckCard({ deck, activeLevel }: VocabDeckCardProps) {
	const learned = getVocabDeckLearnedCount(deck);
	const pct = getVocabDeckProgressPercent(deck);
	const done = isVocabDeckDone(deck);
	const levelMeta =
		activeLevel !== null ? VOCAB_MEMORY_LEVELS[activeLevel - 1] : undefined;
	const levelCount =
		activeLevel !== null ? (deck.levelDistribution[activeLevel - 1] ?? 0) : 0;

	return (
		<article
			data-testid={`vocab-deck-card-${deck.deckId}`}
			aria-labelledby={`vocab-deck-title-${deck.deckId}`}
			className={cn(
				"group relative flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors duration-150 hover:border-primary",
				deck.dueCount > 0 ? "border-foreground" : "border-border",
			)}
		>
			<div className="min-w-0">
				<p
					data-testid={`vocab-deck-source-${deck.deckId}`}
					className="font-semibold text-muted-foreground text-xs uppercase tracking-wider"
				>
					{formatVocabDeckSourceLabel(deck)}
				</p>
				<h3 id={`vocab-deck-title-${deck.deckId}`} className="mt-1">
					<Link
						to="/practice/vocabulary/$deckId"
						params={{ deckId: deck.deckId }}
						className="inline-block max-w-full break-words font-semibold text-foreground text-lg leading-snug tracking-tight after:absolute after:inset-0 after:rounded-xl focus-visible:shadow-none focus-visible:outline-none focus-visible:after:shadow-[var(--focus-ring)] group-hover:text-primary"
					>
						{deck.title}
					</Link>
				</h3>
			</div>

			<div className="grid gap-2">
				<div className="flex justify-between gap-2 text-sm tabular-nums">
					<span className="text-foreground">
						Đã thuộc <strong>{learned}</strong>/{deck.total}
					</span>
					<span className="text-muted-foreground">{pct}%</span>
				</div>
				<div
					aria-hidden="true"
					className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted"
				>
					{VOCAB_MEMORY_LEVELS.map((lv, idx) => {
						const count = deck.levelDistribution[idx] ?? 0;
						if (count <= 0) return null;
						return (
							<span
								key={lv.level}
								style={{ flexGrow: count }}
								className={cn("min-w-1", lv.bgClass)}
							/>
						);
					})}
					{deck.newCount > 0 ? (
						<span
							style={{ flexGrow: deck.newCount }}
							className="min-w-1 bg-muted ring-1 ring-input/50 ring-inset"
						/>
					) : null}
				</div>
			</div>

			<div className="mt-auto flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap gap-1.5">
					{deck.dueCount > 0 ? (
						<span
							data-testid={`vocab-deck-due-${deck.deckId}`}
							className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-0.5 font-medium text-foreground text-xs tabular-nums"
						>
							<Clock aria-hidden="true" className="size-3 text-warn" />
							{deck.dueCount} đến hạn
						</span>
					) : null}
					{deck.newCount > 0 ? (
						<span
							data-testid={`vocab-deck-new-${deck.deckId}`}
							className="inline-flex items-center rounded-full border bg-background px-2.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums"
						>
							{deck.newCount} từ mới
						</span>
					) : null}
					{done ? (
						<span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-0.5 font-medium text-foreground text-xs">
							<Check aria-hidden="true" className="size-3 text-success" />
							Đã thuộc hết
						</span>
					) : null}
					{levelMeta && levelCount > 0 ? (
						<span className="inline-flex items-center rounded-full border bg-background px-2.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
							{levelCount} từ {levelMeta.name.toLowerCase()}
						</span>
					) : null}
				</div>

				{deck.dueCount > 0 ? (
					<Link
						to="/practice/vocabulary/$deckId/session"
						params={{ deckId: deck.deckId }}
						search={{ mode: "review" }}
						aria-label={`Ôn ${deck.dueCount} từ trong ${deck.title}`}
						className={cn(
							buttonVariants({ variant: "default", size: "sm" }),
							"relative z-10 ml-auto min-h-9 shrink-0",
						)}
					>
						Ôn <span className="tabular-nums">{deck.dueCount}</span> từ
					</Link>
				) : deck.newCount > 0 ? (
					<Link
						to="/practice/vocabulary/$deckId/session"
						params={{ deckId: deck.deckId }}
						search={{ mode: "learn" }}
						aria-label={`Học ${deck.newCount} từ mới trong ${deck.title}`}
						className={cn(
							buttonVariants({ variant: "outline", size: "sm" }),
							"relative z-10 ml-auto min-h-9 shrink-0",
						)}
					>
						<Plus aria-hidden="true" className="size-3.5" />
						Học <span className="tabular-nums">{deck.newCount}</span> từ mới
					</Link>
				) : (
					<span
						aria-hidden="true"
						className={cn(
							buttonVariants({ variant: "ghost", size: "sm" }),
							"ml-auto shrink-0",
						)}
					>
						Xem bộ từ
					</span>
				)}
			</div>
		</article>
	);
}
