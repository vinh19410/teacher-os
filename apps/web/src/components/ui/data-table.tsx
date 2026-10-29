import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DataTableProps {
	headers: ReactNode[];
	rows: { cells: ReactNode[]; onClick?: () => void; className?: string }[];
	emptyMessage?: ReactNode;
}

/** Bảng v2 (design `Table`): khối rounded-xl border bg-card, header muted,
 * hàng border-b + hover nhẹ. Giữ API/empty row/hàng clickable hiện có. */
export function DataTable({
	headers,
	rows,
	emptyMessage = "Chưa có dữ liệu.",
}: DataTableProps) {
	return (
		<div className="no-scrollbar relative w-full overflow-x-auto rounded-xl border bg-card">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-b">
						{headers.map((h, i) => (
							<th
								key={`h-${h?.toString?.() ?? i}`}
								className="h-10 whitespace-nowrap px-3 text-left align-middle font-medium text-muted-foreground"
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="[&>tr:hover]:bg-muted/50 [&>tr:last-child]:border-0 [&>tr]:border-b [&>tr]:transition-colors">
					{rows.length === 0 ? (
						<tr>
							<td
								colSpan={headers.length}
								className="px-3 py-8 text-center text-muted-foreground text-sm"
							>
								{emptyMessage}
							</td>
						</tr>
					) : (
						rows.map((row, ri) => (
							<tr
								key={`r-${ri}`}
								onClick={row.onClick}
								tabIndex={row.onClick ? 0 : undefined}
								onKeyDown={
									row.onClick
										? (e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault();
													row.onClick?.();
												}
											}
										: undefined
								}
								className={cn(
									row.onClick &&
										"cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
									row.className,
								)}
							>
								{row.cells.map((cell, ci) => (
									<td key={`c-${ci}`} className="px-3 py-2.5 align-middle">
										{cell}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}
