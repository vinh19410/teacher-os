import {
	createFileRoute,
	Link,
	Outlet,
	useChildMatches,
} from "@tanstack/react-router";
import { formatInterval } from "@teacher-os/api/srs/format";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { useStudentMe } from "@/lib/repos/student";
import { useVocabSessionData } from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/vocab/$deckId")({
	validateSearch: (input: { course?: string }): { course?: string } => ({
		course:
			typeof input.course === "string" && input.course.trim().length > 0
				? input.course.trim()
				: undefined,
	}),
	component: VocabDeckRouteView,
});

function VocabDeckRouteView() {
	const hasChildMatch = useChildMatches().length > 0;
	if (hasChildMatch) return <Outlet />;
	return <VocabDeckDetailPage />;
}

function VocabDeckDetailPage() {
	const { deckId } = Route.useParams();
	const { course } = Route.useSearch();
	const meQuery = useStudentMe();
	const sessionQuery = useVocabSessionData(deckId);

	if (meQuery.isLoading || sessionQuery.isLoading) {
		return <Loader />;
	}

	const me = meQuery.data;
	const data = sessionQuery.data;

	if (!data) {
		return (
			<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
				<div
					data-testid="vocab-deck-not-found"
					className="neu space-y-4 rounded-md p-6 text-center"
				>
					<p className="font-semibold text-fg">Không tìm thấy bộ từ vựng</p>
					{course ? (
						<Link
							to="/vocab/courses/$courseId"
							params={{ courseId: course }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Quay lại bài học trong khóa
						</Link>
					) : (
						<Link
							to="/vocab"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Quay lại danh sách bộ từ
						</Link>
					)}
				</div>
			</StudentShell>
		);
	}

	const now = Date.now();
	const newCount = data.cards.filter((c) => c.state === "new").length;
	const reviewCards = data.cards.filter((c) => c.state === "review");
	const dueCount = reviewCards.filter((c) => c.dueAt <= now).length;

	const futureDueAts = reviewCards
		.filter((c) => c.dueAt > now)
		.map((c) => c.dueAt);
	const earliestFutureDueAt =
		futureDueAts.length > 0 ? Math.min(...futureDueAts) : null;
	const nextReviewIntervalLabel =
		earliestFutureDueAt !== null
			? formatInterval(
					Math.max(1, Math.round((earliestFutureDueAt - now) / 60_000)),
				)
			: null;

	const sessionSearch = (mode: "learn" | "review") =>
		course ? { course, mode } : { mode };

	return (
		<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
			<div data-testid="vocab-deck-detail" className="space-y-8">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						{course ? (
							<Link
								to="/vocab/courses/$courseId"
								params={{ courseId: course }}
								data-testid="vocab-deck-back-link"
								className="font-mono text-[11px] text-meta uppercase tracking-[0.15em] hover:text-hot"
							>
								← Bài học trong khóa
							</Link>
						) : (
							<Link
								to="/vocab"
								data-testid="vocab-deck-back-link"
								className="font-mono text-[11px] text-meta uppercase tracking-[0.15em] hover:text-hot"
							>
								← Danh sách bộ từ
							</Link>
						)}
						<h1
							data-testid="vocab-deck-title"
							className="mt-2 font-display font-extrabold text-3xl text-fg leading-[0.95] tracking-[-0.045em]"
						>
							{data.deck.title}
						</h1>
						{nextReviewIntervalLabel ? (
							<p
								data-testid="vocab-next-review-hint"
								className="mt-2 font-mono text-meta text-xs"
							>
								Đợt ôn tiếp theo sau {nextReviewIntervalLabel}
							</p>
						) : null}
					</div>

					{data.cards.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{reviewCards.length > 0 ? (
								<Link
									to="/vocab/$deckId/session"
									params={{ deckId }}
									search={sessionSearch("review")}
									data-testid="vocab-start-review-btn"
									className={buttonVariants({ variant: "outline" })}
								>
									{dueCount > 0 ? `Ôn tập (${dueCount})` : "Ôn tập"}
								</Link>
							) : (
								<button
									type="button"
									disabled
									title="Chưa có từ nào để ôn"
									aria-label="Ôn tập — Chưa có từ nào để ôn"
									data-testid="vocab-start-review-btn"
									className={buttonVariants({ variant: "outline" })}
								>
									Ôn tập
								</button>
							)}
							{newCount > 0 ? (
								<Link
									to="/vocab/$deckId/session"
									params={{ deckId }}
									search={sessionSearch("learn")}
									data-testid="vocab-start-learn-btn"
									className={buttonVariants({ variant: "default" })}
								>
									Bắt đầu học ({newCount})
								</Link>
							) : (
								<button
									type="button"
									disabled
									title="Đã học hết từ mới"
									aria-label="Bắt đầu học — Đã học hết từ mới"
									data-testid="vocab-start-learn-btn"
									className={buttonVariants({ variant: "default" })}
								>
									Bắt đầu học
								</button>
							)}
						</div>
					) : null}
				</div>

				{/* Word table */}
				<section className="neu overflow-hidden rounded-md">
					<div className="border-line border-b px-5 py-3 font-mono text-[11px] text-meta uppercase tracking-[0.15em]">
						Danh sách từ ({data.cards.length})
					</div>
					{data.cards.length === 0 ? (
						<p className="p-6 text-center text-meta text-sm">
							Bộ từ này chưa có từ vựng nào.
						</p>
					) : (
						<div className="divide-y divide-line">
							{data.cards.map((card) => (
								<div
									key={card.id}
									data-testid="vocab-deck-word-row"
									className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm"
								>
									<div>
										<span className="font-semibold text-fg">{card.word}</span>
										{card.ipa ? (
											<span className="ml-2 font-mono text-meta text-xs">
												{card.ipa}
											</span>
										) : null}
										<p className="mt-0.5 text-meta">{card.translation}</p>
									</div>
									<span className="neu-in rounded-full px-2.5 py-0.5 font-mono text-[10px] text-meta uppercase">
										{card.state === "new" ? "Mới" : `Level ${card.level}`}
									</span>
								</div>
							))}
						</div>
					)}
				</section>
			</div>
		</StudentShell>
	);
}
