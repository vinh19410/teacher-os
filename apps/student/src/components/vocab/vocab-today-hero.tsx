import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { VocabCountdown } from "./vocab-countdown";
import {
	buildStreakWeekDays,
	type VocabHeroState,
} from "./vocab-overview-helpers";

export interface VocabTodayHeroProps {
	heroState: VocabHeroState;
	streak: number;
	streakDays: readonly boolean[];
	todayISO: string;
	onExpired?: () => void;
}

export function VocabTodayHero({
	heroState,
	streak,
	streakDays,
	todayISO,
	onExpired,
}: VocabTodayHeroProps) {
	const weekDays = buildStreakWeekDays(todayISO, streakDays);
	const doneToday = weekDays[6]?.done ?? false;

	return (
		<div
			className={cn(
				"grid grid-cols-1 gap-6 rounded-xl bg-card p-5 shadow-sm sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-8",
				heroState.kind === "due"
					? "border-[1.5px] border-foreground"
					: "border border-border",
			)}
		>
			<div className="min-w-0">
				<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Hôm nay
				</p>

				{heroState.kind === "no-decks" ? (
					<>
						<p className="mt-1 font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
							Bắt đầu bộ từ đầu tiên
						</p>
						<p className="mt-2 text-muted-foreground text-sm sm:text-base">
							{heroState.subtitle}
						</p>
					</>
				) : heroState.kind === "due" ? (
					<>
						<p className="mt-1 font-bold text-2xl text-foreground tabular-nums tracking-tight sm:text-3xl">
							<span data-testid="vocab-overview-due-count">
								{heroState.dueCount}
							</span>{" "}
							từ đến hạn ôn
						</p>
						<p className="mt-2 text-muted-foreground text-sm sm:text-base">
							Khoảng{" "}
							<span className="tabular-nums">{heroState.estimatedMinutes}</span>{" "}
							phút · từ{" "}
							<span className="tabular-nums">{heroState.dueDecksCount}</span> bộ
							từ
							{heroState.totalNewCount > 0 ? (
								<>
									{" "}
									· thêm{" "}
									<span
										data-testid="vocab-overview-new-count"
										className="tabular-nums"
									>
										{heroState.totalNewCount}
									</span>{" "}
									từ mới nếu bạn muốn học tiếp
								</>
							) : null}
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							<Link
								to="/practice/vocabulary/$deckId/session"
								params={{ deckId: heroState.topDueDeck.deckId }}
								search={{ mode: "review" }}
								className={cn(
									buttonVariants({ variant: "default", size: "lg" }),
									"min-h-11 flex-1 sm:flex-initial",
								)}
							>
								Bắt đầu ôn
							</Link>
							{heroState.topNewDeck ? (
								<Link
									to="/practice/vocabulary/$deckId/session"
									params={{ deckId: heroState.topNewDeck.deckId }}
									search={{ mode: "learn" }}
									className={cn(
										buttonVariants({ variant: "outline", size: "lg" }),
										"min-h-11 flex-1 sm:flex-initial",
									)}
								>
									<Plus aria-hidden="true" className="size-4" />
									Học từ mới
								</Link>
							) : null}
						</div>
					</>
				) : heroState.kind === "new-only" ? (
					<>
						<p className="mt-1 font-bold text-2xl text-foreground tabular-nums tracking-tight sm:text-3xl">
							Sẵn sàng học{" "}
							<span data-testid="vocab-overview-new-count">
								{heroState.totalNewCount}
							</span>{" "}
							từ mới
						</p>
						<p className="mt-2 text-muted-foreground text-sm sm:text-base">
							Từ <span className="tabular-nums">{heroState.newDecksCount}</span>{" "}
							bộ từ đang học — học lượt đầu để bắt đầu lịch ôn ngắt quãng.
						</p>
						<div className="mt-5 flex flex-wrap gap-2">
							<Link
								to="/practice/vocabulary/$deckId/session"
								params={{ deckId: heroState.topNewDeck.deckId }}
								search={{ mode: "learn" }}
								className={cn(
									buttonVariants({ variant: "default", size: "lg" }),
									"min-h-11 flex-1 sm:flex-initial",
								)}
							>
								<Plus aria-hidden="true" className="size-4" />
								Học từ mới
							</Link>
						</div>
					</>
				) : heroState.kind === "caught-up" ? (
					<>
						<p className="mt-1 font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
							Bạn đã ôn xong hôm nay
						</p>
						<VocabCountdown
							variant="inline"
							nextDueAt={heroState.nextDueAt}
							upcomingCount={heroState.upcomingCount}
							onExpired={onExpired}
						/>
						{heroState.topNewDeck && heroState.totalNewCount > 0 ? (
							<div className="mt-5 flex flex-wrap gap-2">
								<Link
									to="/practice/vocabulary/$deckId/session"
									params={{ deckId: heroState.topNewDeck.deckId }}
									search={{ mode: "learn" }}
									className={cn(
										buttonVariants({ variant: "default", size: "lg" }),
										"min-h-11 flex-1 sm:flex-initial",
									)}
								>
									<Plus aria-hidden="true" className="size-4" />
									<span>
										Học{" "}
										<span
											data-testid="vocab-overview-new-count"
											className="tabular-nums"
										>
											{heroState.totalNewCount}
										</span>{" "}
										từ mới
									</span>
								</Link>
							</div>
						) : null}
					</>
				) : (
					<>
						<p className="mt-1 font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
							Chưa có từ cần ôn hôm nay
						</p>
						<p className="mt-2 text-muted-foreground text-sm sm:text-base">
							Các bộ từ hiện tại chưa có từ vựng để bắt đầu.
						</p>
					</>
				)}
			</div>

			<div className="grid content-start gap-3 border-border border-t pt-5 lg:min-w-[252px] lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
				<div>
					<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
						Chuỗi ngày học
					</p>
					<p className="mt-0.5 font-bold text-2xl text-foreground tabular-nums tracking-tight">
						<span data-testid="vocab-overview-streak">{streak} ngày</span>{" "}
						<span className="font-medium text-muted-foreground text-sm tracking-normal">
							liên tiếp
						</span>
					</p>
				</div>

				<ul
					aria-label="7 ngày gần nhất"
					className="grid grid-cols-7 gap-1 sm:gap-2"
				>
					{weekDays.map((day) => (
						<li key={day.iso} className="grid justify-items-center gap-1">
							<span
								aria-hidden="true"
								className={cn(
									"grid size-7 place-items-center rounded-full border-[1.5px]",
									day.done
										? "border-foreground bg-foreground text-background"
										: day.isToday
											? "border-foreground border-dashed text-transparent"
											: "border-input text-transparent",
								)}
							>
								{day.done ? (
									<Check aria-hidden="true" className="size-3.5" />
								) : null}
							</span>
							<span
								aria-hidden="true"
								className={cn(
									"text-xs",
									day.isToday
										? "font-semibold text-foreground"
										: "text-muted-foreground",
								)}
							>
								{day.shortLabel}
							</span>
							<span className="sr-only">
								{day.fullLabel}: {day.done ? "đã học" : "chưa học"}
							</span>
						</li>
					))}
				</ul>

				<p className="text-muted-foreground text-xs sm:text-sm">
					{doneToday
						? "Hôm nay đã tính vào chuỗi."
						: streak > 0
							? "Ôn ít nhất 1 từ hôm nay để giữ chuỗi."
							: "Ôn ít nhất 1 từ hôm nay để bắt đầu chuỗi."}
				</p>
			</div>
		</div>
	);
}
