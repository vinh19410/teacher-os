import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader } from "@/components/loader";
import { Pager } from "@/components/practice/pager";
import { useVocabOverview } from "@/lib/repos/vocab";

/**
 * Catalog Từ vựng trong mục Luyện tập (design-v2 `VocabCatalog`): lưới deck
 * hiện có của học viên (đọc từ vocab overview sẵn có — KHÔNG tạo dữ liệu
 * mới), mở vào luồng học `/vocab/$deckId` đã có. Tiến độ = tỷ lệ từ đã bắt
 * đầu học (không còn "new").
 */
export function VocabPracticeCatalog() {
	const overviewQuery = useVocabOverview();
	const [page, setPage] = useState(1);
	const PER = 12;

	if (overviewQuery.isLoading) {
		return <Loader />;
	}
	if (overviewQuery.isError || !overviewQuery.data) {
		return (
			<div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
				Không tải được bộ từ vựng. Vui lòng thử lại.
			</div>
		);
	}

	const decks = overviewQuery.data.decks;
	const pages = Math.max(1, Math.ceil(decks.length / PER));
	const shown = decks.slice((page - 1) * PER, page * PER);

	return (
		<>
			<p className="mb-4 text-muted-foreground text-sm tabular-nums">
				{decks.length} bộ từ — trang {page} / {pages}
			</p>
			{shown.length === 0 ? (
				<div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
					Giáo viên chưa có đề luyện tập cho kỹ năng này
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{shown.map((deck) => {
						const learned = Math.max(0, deck.total - deck.newCount);
						const percent =
							deck.total > 0 ? Math.round((learned / deck.total) * 100) : 0;
						return (
							<Link
								key={deck.deckId}
								to="/vocab/$deckId"
								params={{ deckId: deck.deckId }}
								data-testid="practice-vocab-deck"
								className="flex flex-col rounded-xl border bg-card p-5 text-left text-card-foreground shadow-sm outline-none transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<h3 className="line-clamp-2 font-medium leading-snug">
									{deck.title}
								</h3>
								<p className="mt-0.5 text-muted-foreground text-sm">
									{deck.className || "Bộ đề org"}
									{" · "}
									{deck.total} từ
								</p>
								<div className="mt-auto grid gap-2.5 pt-5 text-sm">
									<div className="flex items-center gap-3">
										<span className="w-16 text-muted-foreground">Tiến độ</span>
										<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
											<div
												className="h-full rounded-full bg-primary transition-[width]"
												style={{ width: `${percent}%` }}
											/>
										</div>
										<span className="w-9 text-right font-medium tabular-nums">
											{percent}%
										</span>
									</div>
								</div>
							</Link>
						);
					})}
				</div>
			)}
			<Pager page={page} pages={pages} onPage={setPage} />
		</>
	);
}
