import type {
	PracticeCatalogItem,
	PracticeSkill,
} from "@teacher-os/api/contracts";
import { BookOpen, Mic } from "lucide-react";
import { Loader } from "@/components/loader";
import { Pager } from "@/components/practice/pager";
import { PracticeFilters } from "@/components/practice/practice-filters";
import { usePracticeCatalog } from "@/lib/repos/student";

/** Nhãn kỹ năng cho header + empty state (design-v2 PRACTICE_INFO, rút gọn). */
export const PRACTICE_SKILL_LABELS: Record<PracticeSkill, string> = {
	reading: "Reading",
	listening: "Listening",
	writing: "Writing",
	speaking: "Speaking",
};

const SEARCH_LABELS: Record<PracticeSkill, string> = {
	reading: "Tìm đề Reading theo tiêu đề…",
	listening: "Tìm đề Listening theo tiêu đề…",
	writing: "Tìm đề Writing theo tiêu đề…",
	speaking: "Tìm đề Speaking theo tiêu đề…",
};

/** Phần trăm thanh điểm: "8/13" → đúng/tổng; "Band 6.5" → band/9. */
function scorePercent(score: string): number {
	if (score.startsWith("Band ")) {
		return (Number.parseFloat(score.slice(5)) / 9) * 100;
	}
	const [done, total] = score.split("/");
	const doneN = Number.parseInt(done ?? "0", 10);
	const totalN = Number.parseInt(total ?? "1", 10);
	return totalN > 0 ? (doneN / totalN) * 100 : 0;
}

function TestCard({
	item,
	onOpen,
}: {
	item: PracticeCatalogItem;
	onOpen: (item: PracticeCatalogItem) => void;
}) {
	const isSpeaking = item.skill === "speaking";
	const score = item.lastAttempt?.score ?? null;
	const isAwaitingGrade =
		(item.skill === "writing" || item.skill === "speaking") &&
		item.lastAttempt?.status === "submitted" &&
		score === null;
	return (
		<button
			type="button"
			data-testid="practice-test-card"
			onClick={() => onOpen(item)}
			className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left text-card-foreground shadow-sm outline-none transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
		>
			<div className="relative grid aspect-[16/9] place-items-center overflow-hidden bg-gradient-to-br from-muted to-muted-foreground/15">
				<div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,var(--color-foreground)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:radial-gradient(circle,black,transparent_70%)]" />
				<span className="relative grid size-14 place-items-center rounded-full border bg-background shadow-sm transition-transform group-hover:scale-110">
					{isSpeaking ? (
						<Mic className="size-6" />
					) : (
						<BookOpen className="size-6" />
					)}
				</span>
				{item.collection && (
					<span className="absolute bottom-2.5 left-2.5 rounded-md bg-background/95 px-2 py-0.5 font-medium text-foreground text-xs shadow-sm">
						{item.collection}
						{item.testGroup ? ` · ${item.testGroup}` : ""}
					</span>
				)}
			</div>
			<div className="flex flex-1 flex-col p-4">
				<h3 className="line-clamp-2 font-medium leading-snug">{item.title}</h3>
				<ul className="mt-2 space-y-0.5 text-muted-foreground text-xs">
					<li className="flex items-center gap-1.5">
						<span className="size-1 rounded-full bg-muted-foreground/60" />
						{item.parts} phần
					</li>
					<li className="flex items-center gap-1.5">
						<span className="size-1 rounded-full bg-muted-foreground/60" />
						{item.durationMin === null
							? "Không giới hạn thời gian"
							: `${item.durationMin} phút`}
					</li>
				</ul>
				<div className="mt-auto flex items-center gap-3 pt-4 text-xs">
					<span className="text-muted-foreground">
						{item.lastAttempt?.status === "graded"
							? "Điểm chấm"
							: isAwaitingGrade
								? "Lần gần nhất"
								: "Kết quả tốt nhất"}
					</span>
					<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-[width]"
							style={{ width: `${score ? scorePercent(score) : 0}%` }}
						/>
					</div>
					<span className="font-medium tabular-nums">
						{isAwaitingGrade ? "Chờ chấm" : (score ?? "—")}
					</span>
				</div>
			</div>
		</button>
	);
}

/**
 * Catalog đề luyện tập một kỹ năng (Reading/Listening/Writing/Speaking) —
 * bố cục design-v2 `SkillCatalog`/`SpeakingCatalog`: hàng filter (bộ đề +
 * ô search debounce 300ms sống trong URL), lưới card 4 cột, Pager 12/trang.
 * Empty state theo nội dung org chưa có đề ready.
 */
export function SkillCatalog({
	skill,
	collection,
	q,
	page,
	onFilterChange,
	onOpen,
}: {
	skill: PracticeSkill;
	collection: string;
	q: string;
	page: number;
	onFilterChange: (next: {
		collection: string;
		q: string;
		page: number;
	}) => void;
	onOpen: (item: PracticeCatalogItem) => void;
}) {
	const catalogQuery = usePracticeCatalog({
		skill,
		collection: collection || undefined,
		q: q || undefined,
		page,
	});

	const catalog = catalogQuery.data;
	const collections = Array.from(
		new Set([
			...(collection ? [collection] : []),
			...(catalog?.items ?? [])
				.map((item) => item.collection)
				.filter((value): value is string => value !== null),
		]),
	).sort();

	return (
		<>
			<PracticeFilters
				searchLabel={SEARCH_LABELS[skill]}
				collections={collections}
				collectionValue={collection}
				qValue={q}
				onCollectionChange={(value) =>
					onFilterChange({ collection: value, q, page: 1 })
				}
				onSearch={(value) => onFilterChange({ collection, q: value, page: 1 })}
			/>
			{catalogQuery.isLoading ? (
				<Loader />
			) : catalogQuery.isError || !catalog ? (
				<div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
					Không tải được danh sách đề. Vui lòng thử lại.
				</div>
			) : (
				<>
					<p className="mb-4 text-muted-foreground text-sm tabular-nums">
						{catalog.total} đề — trang {catalog.page} / {catalog.pages}
					</p>
					{catalog.items.length === 0 ? (
						<div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
							Giáo viên chưa có đề luyện tập cho kỹ năng này
						</div>
					) : (
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
							{catalog.items.map((item) => (
								<TestCard key={item.testId} item={item} onOpen={onOpen} />
							))}
						</div>
					)}
					<Pager
						page={catalog.page}
						pages={catalog.pages}
						onPage={(next) => onFilterChange({ collection, q, page: next })}
					/>
				</>
			)}
		</>
	);
}
