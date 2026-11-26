import type {
	PracticeCatalogItem,
	PracticeSkill,
} from "@teacher-os/api/contracts";
import {
	canonicalizePracticeType,
	practicePartLabel,
	practiceTypeLabel,
	sortPracticeBands,
	sortPracticeParts,
	sortPracticeTypes,
} from "@teacher-os/api/lib/practice-type-catalog";
import { Button } from "@teacher-os/ui/components/button";
import { BookOpen, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/loader";
import { Pager } from "@/components/practice/pager";
import {
	PracticeFilters,
	type PracticeSelectOption,
} from "@/components/practice/practice-filters";
import { PRACTICE_SKILL_LABELS } from "@/components/practice/practice-skill-labels";
import { usePracticeCatalog } from "@/lib/repos/student";

export { PRACTICE_SKILL_LABELS };

export interface PracticeFilterState {
	collection: string;
	part: string;
	type: string;
	band: string;
	q: string;
	page: number;
}

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
	const collectionMeta = [item.collection, item.testGroup]
		.map((value) => value?.trim())
		.filter((value): value is string => Boolean(value))
		.join(" · ");
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
				{collectionMeta && (
					<span
						data-testid="practice-card-source-badge"
						title={collectionMeta}
						className="absolute bottom-2.5 left-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-md bg-background/95 px-2 py-0.5 font-medium text-foreground text-xs shadow-sm"
					>
						{collectionMeta}
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
						{isAwaitingGrade
							? "Đã nộp — Đang chờ giáo viên chấm"
							: (score ?? "—")}
					</span>
				</div>
			</div>
		</button>
	);
}

/**
 * Catalog đề luyện tập một kỹ năng (Reading/Listening/Writing/Speaking) —
 * bố cục design-v2 `SkillCatalog`/`SpeakingCatalog`: hàng filter toàn catalog
 * (bộ đề + phần thi + dạng bài + band có điều kiện + ô search debounce 300ms
 * sống trong URL + nút Xóa bộ lọc), lưới card 4 cột, Pager 12/trang.
 */
export function SkillCatalog({
	skill,
	collection,
	part = "",
	type = "",
	band = "",
	q,
	page,
	onFilterChange,
	onOpen,
}: {
	skill: PracticeSkill;
	collection: string;
	part?: string;
	type?: string;
	band?: string;
	q: string;
	page: number;
	onFilterChange: (
		next: PracticeFilterState,
		options?: { replace?: boolean },
	) => void;
	onOpen: (item: PracticeCatalogItem) => void;
}) {
	const canonicalType = canonicalizePracticeType(skill, type);
	const [resetVersion, setResetVersion] = useState(0);

	const catalogQuery = usePracticeCatalog({
		skill,
		collection: collection || undefined,
		part: part || undefined,
		type: canonicalType || undefined,
		band: band || undefined,
		q: q || undefined,
		page,
	});

	const catalog = catalogQuery.data;
	const onFilterChangeRef = useRef(onFilterChange);
	onFilterChangeRef.current = onFilterChange;

	// Đồng bộ bản chụp mới nhất của bộ lọc để các lần đổi liên tiếp trước khi
	// async beforeLoad của router kịp commit vẫn giữ đủ tham số vừa chọn.
	const latestFiltersRef = useRef<PracticeFilterState>({
		collection,
		part,
		type: canonicalType,
		band,
		q,
		page,
	});
	useEffect(() => {
		void skill;
		latestFiltersRef.current = {
			collection,
			part,
			type: canonicalType,
			band,
			q,
			page,
		};
	}, [skill, collection, part, canonicalType, band, q, page]);

	// Tự động clamp trang vượt biên (kể cả khi total === 0 → pages === 1),
	// tránh giữ URL ?page=5 hiển thị "0 đề — trang 5 / 1".
	useEffect(() => {
		if (
			!catalogQuery.isPlaceholderData &&
			catalog &&
			catalog.page === page &&
			page > catalog.pages
		) {
			const clamped: PracticeFilterState = {
				collection,
				part,
				type: canonicalType,
				band,
				q,
				page: catalog.pages,
			};
			latestFiltersRef.current = clamped;
			onFilterChangeRef.current(clamped, { replace: true });
		}
	}, [
		catalogQuery.isPlaceholderData,
		catalog,
		collection,
		part,
		canonicalType,
		band,
		q,
		page,
	]);

	// Nguồn options lấy từ `catalog.facets` toàn catalog; chỉ fallback về
	// `catalog.items` khi server cũ chưa trả `facets` (deploy skew), lọc sạch chuỗi rỗng.
	const facetCollections = catalog?.facets
		? catalog.facets.collections
		: (catalog?.items ?? [])
				.map((item) => item.collection?.trim() ?? "")
				.filter((value) => value.length > 0);
	const collections = Array.from(
		new Set([...(collection ? [collection] : []), ...facetCollections]),
	).sort((a, b) =>
		a.localeCompare(b, "en", { sensitivity: "base", numeric: true }),
	);

	const rawParts = sortPracticeParts(skill, [
		...(part ? [part] : []),
		...(catalog?.facets?.parts ?? []),
	]);
	const partOptions: PracticeSelectOption[] =
		rawParts.length >= 2 || part
			? rawParts.map((id) => ({
					value: id,
					label: practicePartLabel(skill, id),
				}))
			: [];

	const rawTypes = sortPracticeTypes(skill, [
		...(canonicalType ? [canonicalType] : []),
		...(catalog?.facets?.types ?? []),
	]);
	const typeOptions: PracticeSelectOption[] =
		rawTypes.length >= 2 || canonicalType
			? rawTypes.map((id) => ({
					value: id,
					label: practiceTypeLabel(skill, id),
				}))
			: [];

	const rawBands = sortPracticeBands([
		...(band ? [band] : []),
		...(catalog?.facets?.bands ?? []),
	]);
	const bandOptions: PracticeSelectOption[] =
		rawBands.length >= 2 || band
			? rawBands.map((b) => ({
					value: b,
					label: `Band ${b}`,
				}))
			: [];

	const hasActiveFilters = Boolean(
		collection || part || canonicalType || band || q.trim(),
	);

	const updateFilters = (patch: Partial<PracticeFilterState>) => {
		const next: PracticeFilterState = {
			...latestFiltersRef.current,
			page: 1,
			...patch,
		};
		latestFiltersRef.current = next;
		onFilterChange(next);
	};

	const handleReset = () => {
		setResetVersion((v) => v + 1);
		const cleared: PracticeFilterState = {
			collection: "",
			part: "",
			type: "",
			band: "",
			q: "",
			page: 1,
		};
		latestFiltersRef.current = cleared;
		onFilterChange(cleared);
	};

	return (
		<>
			<PracticeFilters
				key={skill}
				searchLabel={SEARCH_LABELS[skill]}
				collections={collections}
				collectionValue={collection}
				parts={partOptions}
				partValue={part}
				types={typeOptions}
				typeValue={canonicalType}
				bands={bandOptions}
				bandValue={band}
				qValue={q}
				hasActiveFilters={hasActiveFilters}
				resetSignal={resetVersion}
				onCollectionChange={(value) => updateFilters({ collection: value })}
				onPartChange={(value) => updateFilters({ part: value })}
				onTypeChange={(value) => updateFilters({ type: value })}
				onBandChange={(value) => updateFilters({ band: value })}
				onSearch={(value) => updateFilters({ q: value })}
				onReset={handleReset}
			/>
			{catalogQuery.isLoading ? (
				<Loader />
			) : catalogQuery.isError || !catalog ? (
				<div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
					Không tải được danh sách đề. Vui lòng thử lại.
				</div>
			) : (
				<>
					<p
						aria-live="polite"
						className="mb-4 text-muted-foreground text-sm tabular-nums"
					>
						{catalog.total} đề — trang {catalog.page} / {catalog.pages}
					</p>
					{catalog.items.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
							<p>
								{hasActiveFilters
									? "Không tìm thấy đề phù hợp với bộ lọc hiện tại."
									: "Giáo viên chưa có đề luyện tập cho kỹ năng này"}
							</p>
							{hasActiveFilters && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleReset}
								>
									Xóa bộ lọc
								</Button>
							)}
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
						onPage={(next) => updateFilters({ page: next })}
					/>
				</>
			)}
		</>
	);
}
