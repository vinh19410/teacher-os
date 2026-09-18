import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DataTableProps {
	headers: ReactNode[];
	rows: { cells: ReactNode[]; onClick?: () => void; className?: string }[];
	emptyMessage?: ReactNode;
}

export function DataTable({
	headers,
	rows,
	emptyMessage = "Chưa có dữ liệu.",
}: DataTableProps) {
	return (
		<div className="w-full overflow-x-auto">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr>
						{headers.map((h, i) => (
							<th
								key={`h-${h?.toString?.() ?? i}`}
								className="border-line border-b px-4 py-3 text-left font-medium font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]"
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td
								colSpan={headers.length}
								className="px-4 py-8 text-center text-muted-fg text-sm"
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
									"border-line-soft border-b transition-colors duration-[150ms]",
									row.onClick &&
										"cursor-pointer hover:bg-surface focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
								)}
							>
								{row.cells.map((cell, ci) => (
									<td key={`c-${ci}`} className="px-4 py-3 text-left">
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
