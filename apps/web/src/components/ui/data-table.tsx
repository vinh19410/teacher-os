import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DataTableProps {
	headers: ReactNode[];
	rows: { cells: ReactNode[]; onClick?: () => void; className?: string }[];
}

export function DataTable({ headers, rows }: DataTableProps) {
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
					{rows.map((row, ri) => (
						<tr
							key={`r-${ri}`}
							onClick={row.onClick}
							className={cn(
								"border-line-soft border-b transition-colors duration-[150ms]",
								row.onClick && "cursor-pointer hover:bg-surface",
							)}
						>
							{row.cells.map((cell, ci) => (
								<td key={`c-${ci}`} className="px-4 py-3 text-left">
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
