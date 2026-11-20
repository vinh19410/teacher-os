import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import type {
	LibraryTestListItem,
	LibraryTestPageSize,
} from "@teacher-os/api/library-contracts";
import { buttonVariants } from "@teacher-os/ui/components/web-kit/button";
import { ChipFilter } from "@teacher-os/ui/components/web-kit/chip-filter";
import { Input } from "@teacher-os/ui/components/web-kit/field";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DeleteTestDialog } from "@/components/library/delete-test-dialog";
import { libraryErrorMessage } from "@/components/library/library-error";
import {
	countsToChipCounts,
	DEFAULT_FILTERS,
	filtersToSearch,
	hasActiveFilters,
	type LibraryTestFilters,
	normalizeFilters,
	parseLibrarySearch,
	SKILL_CHIPS,
	type SkillFilter,
	STATUS_CHIPS,
	type StatusFilter,
} from "@/components/library/library-filters";
import { PaginationBar } from "@/components/library/pagination-bar";
import { TestTable } from "@/components/library/test-table";
import {
	deleteLibraryTest,
	libraryTestsPageQueryOptions,
} from "@/lib/repos/library";

/**
 * Trang danh sách bộ đề thư viện: filter skill/status/search và phân trang
 * phía server sống trong URL, search debounce ~300ms, badge đếm trên chip
 * aria-hidden, xóa qua dialog xác nhận.
 */

export const Route = createFileRoute("/_auth/library/tests/")({
	validateSearch: parseLibrarySearch,
	component: LibraryTestsRoute,
});

export function LibraryTestsRoute() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const searchParams = useSearch({ from: "/_auth/library/tests/" });
	const filters = useMemo(() => normalizeFilters(searchParams), [searchParams]);

	const query = useQuery(
		libraryTestsPageQueryOptions({
			skill: filters.skill === "all" ? undefined : filters.skill,
			status: filters.status === "all" ? undefined : filters.status,
			q: filters.q || undefined,
			page: filters.page,
			pageSize: filters.pageSize,
		}),
	);

	const tests = query.data?.tests ?? [];
	const total = query.data?.total ?? 0;
	const totalPages = query.data?.totalPages ?? 1;
	const isUpdating = query.isFetching && query.isPlaceholderData;
	const isClamping =
		!query.isPlaceholderData &&
		query.data !== undefined &&
		filters.page > query.data.totalPages;

	const [deleting, setDeleting] = useState<LibraryTestListItem | null>(null);
	const tableTopRef = useRef<HTMLDivElement>(null);

	const deleteMutation = useMutation({
		mutationFn: (testId: string) => deleteLibraryTest(testId),
		onSuccess: (_data, testId) => {
			setDeleting(null);
			toast.success("Đã xóa bộ đề.");
			void queryClient.invalidateQueries({
				queryKey: ["admin", "library", "tests"],
			});
			if (deleting?.id === testId) setDeleting(null);
		},
		onError: (error) => {
			toast.error(libraryErrorMessage(error));
		},
	});

	// --- Search debounce 300ms lên URL (state local + lastEmitted để điều
	// hướng không rớt ký tự khi commit trễ) ---
	const [queryInput, setQueryInput] = useState(() => filters.q);
	const lastEmitted = useRef(filters.q);

	const updateFilters = (next: {
		q?: string;
		skill?: SkillFilter;
		status?: StatusFilter;
		pageSize?: LibraryTestPageSize;
	}) => {
		const merged: LibraryTestFilters = {
			...filters,
			...next,
			page: 1,
		};
		lastEmitted.current = merged.q.trim();
		void navigate({
			to: "/library/tests",
			search: filtersToSearch(merged),
			replace: true,
		});
	};

	const updateFiltersRef = useRef(updateFilters);
	updateFiltersRef.current = updateFilters;

	useEffect(() => {
		if (filters.q !== lastEmitted.current) {
			lastEmitted.current = filters.q;
			setQueryInput(filters.q);
		}
	}, [filters.q]);

	useEffect(() => {
		const trimmed = queryInput.trim();
		if (trimmed === lastEmitted.current) return;
		const timer = setTimeout(() => {
			updateFiltersRef.current({ q: trimmed });
		}, 300);
		return () => clearTimeout(timer);
	}, [queryInput]);

	useEffect(() => {
		if (!isClamping || !query.data) return;
		void navigate({
			to: "/library/tests",
			search: filtersToSearch({ ...filters, page: query.data.totalPages }),
			replace: true,
		});
	}, [isClamping, query.data, filters, navigate]);

	const handlePageChange = (nextPage: number) => {
		void navigate({
			to: "/library/tests",
			search: filtersToSearch({ ...filters, page: nextPage }),
			replace: false,
		});
		tableTopRef.current?.scrollIntoView?.({
			behavior: "smooth",
			block: "nearest",
		});
	};

	const skillCounts = countsToChipCounts(query.data?.counts, "skill");
	const statusCounts = countsToChipCounts(query.data?.counts, "status");
	const activeFilters = hasActiveFilters(filters);

	return (
		<section
			aria-label="Thư viện đề"
			className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="font-semibold text-xl">Thư viện đề</h1>
					<p className="text-muted-foreground text-sm">
						Quản lý đề Reading / Listening dùng chung cho hệ thống.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/library/packs"
						className={buttonVariants({ variant: "outline" })}
					>
						Bộ đề tự học
					</Link>
					<Link
						to="/library/tests/new"
						className={buttonVariants({ className: "gap-2" })}
					>
						<Plus aria-hidden="true" className="size-4" />
						Tạo bộ đề
					</Link>
				</div>
			</div>

			<div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
				<div className="flex flex-col gap-1">
					<label htmlFor="library-test-search" className="font-medium text-sm">
						Tìm kiếm
					</label>
					<Input
						id="library-test-search"
						type="search"
						value={queryInput}
						placeholder="Theo tiêu đề, bộ sưu tập, nhóm đề…"
						onChange={(event) => setQueryInput(event.target.value)}
						className="max-w-md"
					/>
				</div>
				<ChipFilter
					options={SKILL_CHIPS.map((chip) => chip.label)}
					value={
						SKILL_CHIPS.find((chip) => chip.id === filters.skill)?.label ??
						"Tất cả"
					}
					onChange={(label) => {
						const chip = SKILL_CHIPS.find((entry) => entry.label === label);
						if (chip) updateFilters({ skill: chip.id });
					}}
					ariaLabel="Lọc theo kỹ năng"
					counts={skillCounts}
				/>
				<ChipFilter
					options={STATUS_CHIPS.map((chip) => chip.label)}
					value={
						STATUS_CHIPS.find((chip) => chip.id === filters.status)?.label ??
						"Tất cả"
					}
					onChange={(label) => {
						const chip = STATUS_CHIPS.find((entry) => entry.label === label);
						if (chip) updateFilters({ status: chip.id });
					}}
					ariaLabel="Lọc theo trạng thái"
					counts={statusCounts}
				/>
			</div>

			<p
				aria-live="polite"
				role="status"
				className="text-muted-foreground text-sm"
			>
				{query.isPending
					? "Đang tải danh sách bộ đề…"
					: query.isError
						? ""
						: `Tìm thấy ${total} bộ đề.${isUpdating ? " Đang cập nhật…" : ""}`}
			</p>

			{query.isError && (
				<div
					role="alert"
					className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
				>
					<p className="text-destructive text-sm">
						Không tải được danh sách bộ đề. Vui lòng thử lại.
					</p>
					<button
						type="button"
						className={buttonVariants({
							variant: "outline",
							size: "sm",
							className: "self-start",
						})}
						onClick={() => void query.refetch()}
					>
						Thử lại
					</button>
				</div>
			)}

			{query.isSuccess && !isClamping && tests.length > 0 && (
				<>
					<div ref={tableTopRef}>
						<TestTable
							items={tests}
							deletingId={
								deleteMutation.isPending ? (deleting?.id ?? null) : null
							}
							onDelete={setDeleting}
						/>
					</div>
					<PaginationBar
						page={filters.page}
						pageSize={filters.pageSize}
						total={total}
						totalPages={totalPages}
						isFetching={isUpdating}
						onPageChange={handlePageChange}
						onPageSizeChange={(pageSize) => updateFilters({ pageSize })}
					/>
				</>
			)}

			{query.isSuccess && !isClamping && total === 0 && !activeFilters && (
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
					<p className="font-medium text-sm">Chưa có bộ đề nào.</p>
					<p className="text-muted-foreground text-sm">
						Tạo bộ đề Reading hoặc Listening đầu tiên để bắt đầu.
					</p>
					<Link
						to="/library/tests/new"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						Tạo bộ đề
					</Link>
				</div>
			)}

			{query.isSuccess && !isClamping && total === 0 && activeFilters && (
				<div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
					<p className="font-medium text-sm">Không có bộ đề nào khớp bộ lọc.</p>
					<button
						type="button"
						className={buttonVariants({ variant: "outline", size: "sm" })}
						onClick={() => {
							lastEmitted.current = "";
							setQueryInput("");
							void navigate({
								to: "/library/tests",
								search: filtersToSearch(DEFAULT_FILTERS),
								replace: true,
							});
						}}
					>
						Xóa bộ lọc
					</button>
				</div>
			)}

			<DeleteTestDialog
				test={deleting}
				busy={deleteMutation.isPending}
				onCancel={() => setDeleting(null)}
				onConfirm={() => {
					if (deleting) deleteMutation.mutate(deleting.id);
				}}
			/>
		</section>
	);
}
