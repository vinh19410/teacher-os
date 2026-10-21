import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { VocabSuggestionItem } from "@teacher-os/api/contracts";
import { useState } from "react";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { VocabCountdown } from "@/components/vocab/vocab-countdown";
import { VocabCoursesCta } from "@/components/vocab/vocab-courses-cta";
import { VocabSuggestionList } from "@/components/vocab/vocab-suggestion-list";
import { useStudentMe } from "@/lib/repos/student";
import {
	acceptVocabSuggestion,
	dismissVocabSuggestion,
	useVocabOverview,
} from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/practice/vocabulary/")({
	component: VocabOverviewPage,
});

function VocabOverviewPage() {
	const meQuery = useStudentMe();
	const overviewQuery = useVocabOverview();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
	const [suggestionError, setSuggestionError] = useState<string | null>(null);

	const handleAcceptSuggestion = async (suggestion: VocabSuggestionItem) => {
		if (busySuggestionId) return;
		setBusySuggestionId(suggestion.id);
		setSuggestionError(null);
		try {
			await acceptVocabSuggestion(suggestion.id);
			await queryClient.invalidateQueries({
				queryKey: ["student", "vocab-overview"],
			});
			await navigate({
				to: "/practice/vocabulary/$deckId",
				params: { deckId: suggestion.deckId },
			});
		} catch {
			setSuggestionError("Không thể mở bộ từ gợi ý. Vui lòng thử lại.");
		} finally {
			setBusySuggestionId(null);
		}
	};

	const handleDismissSuggestion = async (suggestion: VocabSuggestionItem) => {
		if (busySuggestionId) return;
		setBusySuggestionId(suggestion.id);
		setSuggestionError(null);
		try {
			await dismissVocabSuggestion(suggestion.id);
			await queryClient.invalidateQueries({
				queryKey: ["student", "vocab-overview"],
			});
		} catch {
			setSuggestionError("Không thể ẩn gợi ý. Vui lòng thử lại.");
		} finally {
			setBusySuggestionId(null);
		}
	};
	if (meQuery.isLoading || overviewQuery.isLoading) {
		return <Loader />;
	}

	const me = meQuery.data;
	const data = overviewQuery.data;

	if (!data) {
		return (
			<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
				<div className="rounded-md rounded-xl border bg-card p-6 text-center shadow-sm">
					<p className="text-muted-foreground text-sm">
						Không tải được dữ liệu từ vựng. Vui lòng thử lại.
					</p>
				</div>
			</StudentShell>
		);
	}

	// Thống kê tổng Từ mới (client-side, không đổi API): cộng newCount mọi bộ đang học.
	const totalNewCount = data.decks.reduce((sum, d) => sum + d.newCount, 0);

	return (
		<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
			<div data-testid="vocab-overview-page" className="space-y-8">
				<header className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
							Spaced Repetition · 5 Memory Levels
						</p>
						<h1 className="mt-2 font-extrabold text-3xl text-foreground leading-[0.95] tracking-[-0.045em]">
							Từ vựng
						</h1>
					</div>
				</header>

				{/* Gợi ý cho bạn (#363) */}
				<VocabSuggestionList
					suggestions={data.suggestions}
					busyId={busySuggestionId}
					errorMsg={suggestionError}
					onAccept={(s) => void handleAcceptSuggestion(s)}
					onDismiss={(s) => void handleDismissSuggestion(s)}
				/>

				{/* Stats row */}
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
					<div className="rounded-md rounded-xl border bg-card p-4 shadow-sm">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
							Từ mới
						</p>
						<p
							data-testid="vocab-overview-new-count"
							className="mt-1 font-extrabold text-2xl text-foreground"
						>
							{totalNewCount}
						</p>
					</div>
					<div className="rounded-md rounded-xl border bg-card p-4 shadow-sm">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
							Đến hạn ôn
						</p>
						<p
							data-testid="vocab-overview-due-count"
							className="mt-1 font-extrabold text-2xl text-primary"
						>
							{data.dueCount}
						</p>
					</div>
					<div className="rounded-md rounded-xl border bg-card p-4 shadow-sm">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
							Chuỗi ngày (Streak)
						</p>
						<p
							data-testid="vocab-overview-streak"
							className="mt-1 font-extrabold text-2xl text-foreground"
						>
							{data.streak} ngày
						</p>
					</div>
					<div className="rounded-md rounded-xl border bg-card p-4 shadow-sm">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
							Đã thuộc (L2+)
						</p>
						<p
							data-testid="vocab-overview-learned"
							className="mt-1 font-extrabold text-2xl text-foreground"
						>
							{data.learnedCount}
						</p>
					</div>
					<div className="rounded-md rounded-xl border bg-card p-4 shadow-sm">
						<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
							Thành thạo (L5) · Nhớ
						</p>
						<p
							data-testid="vocab-overview-mature"
							className="mt-1 font-extrabold text-2xl text-foreground"
						>
							{data.matureCount}
							<span className="ml-2 font-mono font-normal text-muted-foreground text-xs">
								({data.retention !== null ? `${data.retention}%` : "—"})
							</span>
						</p>
					</div>
				</div>

				{/* Countdown when dueCount == 0 and nextDueAt != null */}
				{data.dueCount === 0 && data.nextDueAt !== null ? (
					<VocabCountdown
						nextDueAt={data.nextDueAt}
						upcomingCount={data.upcomingCount}
						onExpired={() => void overviewQuery.refetch()}
					/>
				) : null}

				{/* Level distribution */}
				<section className="space-y-3 rounded-md rounded-xl border bg-card p-5 shadow-sm">
					<h2 className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
						Phân bổ 5 cấp độ trí nhớ
					</h2>
					<div className="grid grid-cols-5 gap-2">
						{data.levelDistribution.map((count, idx) => (
							<div
								key={`level-${idx + 1}`}
								className="rounded-md rounded-md bg-muted p-3 text-center"
							>
								<p className="font-mono text-[10px] text-muted-foreground uppercase">
									L{idx + 1}
								</p>
								<p className="mt-1 font-mono font-semibold text-base text-foreground">
									{count}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Deck list */}
				<section className="space-y-4">
					<h2 className="font-extrabold text-foreground text-xl tracking-[-0.02em]">
						Bộ từ đang học
					</h2>
					{data.decks.length === 0 ? (
						<div
							data-testid="vocab-decks-empty"
							className="rounded-md rounded-xl border bg-card p-8 text-center shadow-sm"
						>
							<p className="font-semibold text-foreground">
								Chưa có bộ từ đang học
							</p>
							<p className="mt-1 text-muted-foreground text-sm">
								Mở mục Khóa học từ vựng bên dưới để bắt đầu học ngay, hoặc đợi
								giáo viên giao bộ từ cho lớp của bạn.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{data.decks.map((deck) => (
								<Link
									key={deck.deckId}
									to="/practice/vocabulary/$deckId"
									params={{ deckId: deck.deckId }}
									data-testid={`vocab-deck-card-${deck.deckId}`}
									className="group flex flex-col justify-between gap-4 rounded-md rounded-xl border bg-card p-5 shadow-sm transition-colors duration-150 hover:border-primary"
								>
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<span
												data-testid={`vocab-deck-source-${deck.deckId}`}
												className="rounded rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
											>
												{deck.source === "suggested"
													? "Gợi ý"
													: deck.source === "library"
														? deck.className
															? `Khóa ${deck.className}`
															: "Khóa học"
														: deck.className
															? `Lớp ${deck.className}`
															: "Lớp học"}
											</span>
										</div>
										<h3 className="mt-1.5 font-extrabold text-foreground text-lg group-hover:text-primary">
											{deck.title}
										</h3>
									</div>
									<div
										aria-hidden="true"
										className="flex flex-wrap items-center gap-2 font-mono text-xs"
									>
										<span className="rounded-full rounded-md bg-muted px-2.5 py-0.5 text-muted-foreground">
											{deck.total} từ
										</span>
										{deck.newCount > 0 ? (
											<span
												data-testid={`vocab-deck-new-${deck.deckId}`}
												className="rounded-full rounded-md bg-muted px-2.5 py-0.5 text-primary"
											>
												{deck.newCount} từ mới
											</span>
										) : null}
										{deck.dueCount > 0 ? (
											<span
												data-testid={`vocab-deck-due-${deck.deckId}`}
												className="rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground"
											>
												{deck.dueCount} đến hạn
											</span>
										) : null}
									</div>
								</Link>
							))}
						</div>
					)}
				</section>

				<VocabCoursesCta />
			</div>
		</StudentShell>
	);
}
