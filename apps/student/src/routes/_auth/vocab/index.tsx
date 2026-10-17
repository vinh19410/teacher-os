import { createFileRoute, Link } from "@tanstack/react-router";
import { StudentShell } from "@/components/layout/student-shell";
import Loader from "@/components/loader";
import { VocabCountdown } from "@/components/vocab/vocab-countdown";
import { useStudentMe } from "@/lib/repos/student";
import { useVocabOverview } from "@/lib/repos/vocab";

export const Route = createFileRoute("/_auth/vocab/")({
	component: VocabOverviewPage,
});

function VocabOverviewPage() {
	const meQuery = useStudentMe();
	const overviewQuery = useVocabOverview();

	if (meQuery.isLoading || overviewQuery.isLoading) {
		return <Loader />;
	}

	const me = meQuery.data;
	const data = overviewQuery.data;

	if (!data) {
		return (
			<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
				<div className="neu rounded-md p-6 text-center">
					<p className="text-meta text-sm">
						Không tải được dữ liệu từ vựng. Vui lòng thử lại.
					</p>
				</div>
			</StudentShell>
		);
	}

	return (
		<StudentShell userName={me?.student.name} userEmail={me?.user.email}>
			<div data-testid="vocab-overview-page" className="space-y-8">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
							Spaced Repetition · 5 Memory Levels
						</p>
						<h1 className="mt-2 font-display font-extrabold text-3xl text-fg leading-[0.95] tracking-[-0.045em]">
							Từ vựng của tôi
						</h1>
					</div>
					<Link
						to="/"
						className="neu-sm rounded-md px-3 py-1.5 font-mono text-fg text-xs hover:border-fg"
					>
						← Trang chủ
					</Link>
				</div>

				{/* Stats row */}
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div className="neu rounded-md p-4">
						<p className="font-mono text-[10px] text-meta uppercase tracking-widest">
							Đến hạn ôn
						</p>
						<p
							data-testid="vocab-overview-due-count"
							className="mt-1 font-display font-extrabold text-2xl text-hot"
						>
							{data.dueCount}
						</p>
					</div>
					<div className="neu rounded-md p-4">
						<p className="font-mono text-[10px] text-meta uppercase tracking-widest">
							Chuỗi ngày (Streak)
						</p>
						<p
							data-testid="vocab-overview-streak"
							className="mt-1 font-display font-extrabold text-2xl text-fg"
						>
							{data.streak} ngày
						</p>
					</div>
					<div className="neu rounded-md p-4">
						<p className="font-mono text-[10px] text-meta uppercase tracking-widest">
							Đã thuộc (L2+)
						</p>
						<p
							data-testid="vocab-overview-learned"
							className="mt-1 font-display font-extrabold text-2xl text-fg"
						>
							{data.learnedCount}
						</p>
					</div>
					<div className="neu rounded-md p-4">
						<p className="font-mono text-[10px] text-meta uppercase tracking-widest">
							Thành thạo (L5) · Nhớ
						</p>
						<p
							data-testid="vocab-overview-mature"
							className="mt-1 font-display font-extrabold text-2xl text-fg"
						>
							{data.matureCount}
							<span className="ml-2 font-mono font-normal text-meta text-xs">
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
				<section className="neu space-y-3 rounded-md p-5">
					<h2 className="font-mono text-[11px] text-meta uppercase tracking-[0.15em]">
						Phân bổ 5 cấp độ trí nhớ
					</h2>
					<div className="grid grid-cols-5 gap-2">
						{data.levelDistribution.map((count, idx) => (
							<div
								key={`level-${idx + 1}`}
								className="neu-in rounded-md p-3 text-center"
							>
								<p className="font-mono text-[10px] text-meta uppercase">
									L{idx + 1}
								</p>
								<p className="mt-1 font-mono font-semibold text-base text-fg">
									{count}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Deck list */}
				<section className="space-y-4">
					<h2 className="font-display font-extrabold text-fg text-xl tracking-[-0.02em]">
						Bộ từ theo lớp học
					</h2>
					{data.decks.length === 0 ? (
						<div
							data-testid="vocab-decks-empty"
							className="neu rounded-md p-8 text-center"
						>
							<p className="font-semibold text-fg">Chưa có bộ từ vựng nào</p>
							<p className="mt-1 text-meta text-sm">
								Khi giáo viên thêm bộ từ vựng cho lớp của bạn, chúng sẽ hiển thị
								tại đây.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{data.decks.map((deck) => (
								<Link
									key={deck.deckId}
									to="/vocab/$deckId"
									params={{ deckId: deck.deckId }}
									data-testid={`vocab-deck-card-${deck.deckId}`}
									className="neu group flex flex-col justify-between gap-4 rounded-md p-5 transition-colors duration-150 hover:border-fg"
								>
									<div>
										<p className="font-mono text-[10px] text-meta uppercase tracking-widest">
											{deck.className}
										</p>
										<h3 className="mt-1 font-display font-extrabold text-fg text-lg group-hover:text-hot">
											{deck.title}
										</h3>
									</div>
									<div className="flex flex-wrap items-center gap-2 font-mono text-xs">
										<span className="neu-in rounded-full px-2.5 py-0.5 text-meta">
											{deck.total} từ
										</span>
										{deck.newCount > 0 ? (
											<span
												data-testid={`vocab-deck-new-${deck.deckId}`}
												className="neu-in rounded-full px-2.5 py-0.5 text-hot"
											>
												{deck.newCount} từ mới
											</span>
										) : null}
										{deck.dueCount > 0 ? (
											<span
												data-testid={`vocab-deck-due-${deck.deckId}`}
												className="rounded-full bg-hot px-2.5 py-0.5 text-accent-on"
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
			</div>
		</StudentShell>
	);
}
