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
		<div className="neu w-full overflow-x-auto rounded-md px-5 py-2">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr>
						{headers.map((h, i) => (
							<th
								key={`h-${h?.toString?.() ?? i}`}
								className="px-4 py-2 pr-4 text-left font-mono font-normal text-[11px] text-meta uppercase tracking-[0.15em]"
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="[&>tr]:border-line [&>tr]:border-t">
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
									"transition-colors duration-[150ms]",
									row.onClick &&
										"cursor-pointer hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
									row.className,
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
