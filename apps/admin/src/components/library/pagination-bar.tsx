import {
	LIBRARY_TEST_PAGE_SIZES,
	type LibraryTestPageSize,
	parseLibraryTestPageSizeParam,
} from "@teacher-os/api/library-contracts";
import { buttonVariants } from "@teacher-os/ui/components/web-kit/button";
import { Select } from "@teacher-os/ui/components/web-kit/field";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId } from "react";
import { buildPageItems, pageItemRange } from "./library-filters";

export interface PaginationBarProps {
	page: number;
	pageSize: LibraryTestPageSize;
	total: number;
	totalPages: number;
	isFetching?: boolean;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: LibraryTestPageSize) => void;
}

/**
 * Thanh phân trang thuần trình bày cho danh sách bộ đề: hiển thị khoảng mục,
 * bộ chọn số dòng mỗi trang và cụm điều hướng trang đáp ứng trên mobile/desktop.
 */
export function PaginationBar({
	page,
	pageSize,
	total,
	totalPages,
	isFetching = false,
	onPageChange,
	onPageSizeChange,
}: PaginationBarProps) {
	const selectId = useId();
	if (total <= 0) return null;

	const { start, end } = pageItemRange(page, pageSize, total);
	const pageItems = buildPageItems(page, totalPages);

	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
			<div className="flex flex-wrap items-center justify-between gap-3 sm:justify-start">
				<p className="text-muted-foreground text-sm tabular-nums">
					Hiển thị {start}–{end} / {total} bộ đề
					{isFetching ? " · đang cập nhật…" : null}
				</p>
				<div className="flex items-center gap-2">
					<label
						htmlFor={selectId}
						className="whitespace-nowrap text-muted-foreground text-sm"
					>
						Số dòng:
					</label>
					<Select
						id={selectId}
						aria-label="Số bộ đề mỗi trang"
						value={String(pageSize)}
						onChange={(event) => {
							const next = parseLibraryTestPageSizeParam(event.target.value);
							if (next !== null && next !== pageSize) {
								onPageSizeChange(next);
							}
						}}
						className="h-8 w-auto min-w-[4.5rem]"
					>
						{LIBRARY_TEST_PAGE_SIZES.map((size) => (
							<option key={size} value={String(size)}>
								{size}
							</option>
						))}
					</Select>
				</div>
			</div>

			<nav
				aria-label="Phân trang bộ đề"
				className="flex flex-wrap items-center justify-between gap-2 sm:justify-end"
			>
				<button
					type="button"
					disabled={page <= 1}
					onClick={() => {
						if (page > 1) onPageChange(page - 1);
					}}
					className={buttonVariants({
						variant: "outline",
						size: "sm",
						className: "px-2.5 sm:px-3",
					})}
				>
					<ChevronLeft aria-hidden="true" className="size-4" />
					Trang trước
				</button>

				<div className="hidden items-center gap-1 sm:flex">
					{pageItems.map((item, idx) =>
						item === "ellipsis" ? (
							<span
								key={idx === 1 ? "ellipsis-start" : "ellipsis-end"}
								aria-hidden="true"
								className="select-none px-1.5 text-muted-foreground text-sm"
							>
								…
							</span>
						) : (
							<button
								key={item}
								type="button"
								aria-label={`Trang ${item}`}
								aria-current={item === page ? "page" : undefined}
								onClick={() => {
									if (item !== page) onPageChange(item);
								}}
								className={buttonVariants({
									variant: item === page ? "default" : "outline",
									size: "sm",
									className: "min-w-8 px-2 tabular-nums",
								})}
							>
								{item}
							</button>
						),
					)}
				</div>

				<span className="text-muted-foreground text-sm tabular-nums sm:hidden">
					Trang {page} / {totalPages}
				</span>

				<button
					type="button"
					disabled={page >= totalPages}
					onClick={() => {
						if (page < totalPages) onPageChange(page + 1);
					}}
					className={buttonVariants({
						variant: "outline",
						size: "sm",
						className: "px-2.5 sm:px-3",
					})}
				>
					Trang sau
					<ChevronRight aria-hidden="true" className="size-4" />
				</button>
			</nav>
		</div>
	);
}
