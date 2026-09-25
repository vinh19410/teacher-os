import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
	addTableCol,
	addTableRow,
	emptyTableGrid,
	removeTableCol,
	removeTableRow,
	segmentsToItems,
	type TableGridState,
	tableApplyIssues,
	tableSegments,
	toggleTableCell,
	updateTableBlank,
	updateTableCell,
} from "@/lib/cloze";
import { cn } from "@/lib/cn";
import type { QuestionItem } from "./assignment-presets";
import { hasItemContent } from "./cloze-editor";

/**
 * Table-completion grid editor (phase-03 FR4). The teacher types the table
 * (column headers on top, row labels on the left), then toggles cells into
 * blanks — the cleared content becomes the answer. Applying emits one item
 * per blank with the marker-EXEMPT `[table] r{row} c{col}: <row> / <col>`
 * stem (FR7: tablecomp stems carry no `____` marker). Caps mirror the cloze
 * path (≤ 40 blanks, stem ≤ 500) BEFORE writing items, and composed items
 * are never overwritten without a confirm (FR2 parity, red-team #8 hoist).
 */

export function TableGridEditor({
	items,
	onApply,
	initialGrid,
	initialActiveCell = null,
}: {
	items: QuestionItem[];
	onApply: (items: QuestionItem[]) => void;
	/** Test/restore seam — the editor owns its state after mount. */
	initialGrid?: TableGridState;
	initialActiveCell?: [number, number] | null;
}) {
	const [grid, setGrid] = useState<TableGridState>(
		() => initialGrid ?? emptyTableGrid(2, 2),
	);
	const [activeCell, setActiveCell] = useState<[number, number] | null>(
		initialActiveCell,
	);

	const segments = tableSegments(grid);
	const issues = tableApplyIssues(grid);
	const canApply = grid.blanks.length > 0 && issues.length === 0;
	const willReplace = items.some(hasItemContent);
	const activeBlank = activeCell
		? grid.blanks.find(
				(blank) => blank.row === activeCell[0] && blank.col === activeCell[1],
			)
		: undefined;

	const handleApply = () => {
		if (!canApply) return;
		if (
			willReplace &&
			!window.confirm(
				`Áp vào bảng sẽ thay thế ${items.length} câu hiện có. Tiếp tục?`,
			)
		)
			return;
		onApply(segmentsToItems(segments));
	};

	return (
		<div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="font-medium text-muted-fg text-xs">
					Soạn bảng — nhập ô rồi bấm nút gạch dưới để biến ô thành chỗ trống
				</p>
				<span className="font-mono text-meta text-xs">
					{grid.blanks.length}/40 ô trống · Số câu sẽ tạo: {segments.length}
				</span>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[28rem] border-collapse">
					<thead>
						<tr>
							<th scope="col" className="w-40 p-1 align-bottom">
								<span className="sr-only">Nhãn hàng</span>
							</th>
							{grid.colTitles.map((title, col) => (
								<th key={col} scope="col" className="p-1 align-bottom">
									<div className="flex flex-col gap-1">
										<Input
											value={title}
											aria-label={`Tiêu đề cột ${col + 1}`}
											placeholder="Tiêu đề cột"
											maxLength={200}
											onChange={(event) =>
												setGrid((current) => ({
													...current,
													colTitles: current.colTitles.map((value, index) =>
														index === col ? event.target.value : value,
													),
												}))
											}
										/>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											aria-label={`Xóa cột ${col + 1}`}
											disabled={grid.colTitles.length <= 1}
											onClick={() => {
												setGrid((current) => removeTableCol(current, col));
												setActiveCell(null);
											}}
										>
											Xóa cột
										</Button>
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{grid.rowTitles.map((rowTitle, row) => (
							<tr key={row}>
								<th scope="row" className="p-1 align-top">
									<div className="flex flex-col gap-1">
										<Input
											value={rowTitle}
											aria-label={`Tiêu đề hàng ${row + 1}`}
											placeholder="Tiêu đề hàng"
											maxLength={200}
											onChange={(event) =>
												setGrid((current) => ({
													...current,
													rowTitles: current.rowTitles.map((value, index) =>
														index === row ? event.target.value : value,
													),
												}))
											}
										/>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											aria-label={`Xóa hàng ${row + 1}`}
											disabled={grid.rowTitles.length <= 1}
											onClick={() => {
												setGrid((current) => removeTableRow(current, row));
												setActiveCell(null);
											}}
										>
											Xóa hàng
										</Button>
									</div>
								</th>
								{grid.colTitles.map((_, col) => {
									const blank = grid.blanks.find(
										(entry) => entry.row === row && entry.col === col,
									);
									return (
										<td key={col} className="p-1 align-top">
											{blank ? (
												<button
													type="button"
													aria-label={`Chỗ trống ô hàng ${row + 1} cột ${col + 1}`}
													onClick={() => setActiveCell([row, col])}
													className={cn(
														"w-full rounded-sm border border-fg border-dashed bg-bg px-3 py-[10px] font-mono text-sm",
														activeCell?.[0] === row &&
															activeCell?.[1] === col &&
															"outline outline-fg",
													)}
												>
													____
												</button>
											) : (
												<div className="flex items-start gap-1">
													<Input
														value={grid.cells[row]?.[col] ?? ""}
														aria-label={`Ô hàng ${row + 1} cột ${col + 1}`}
														maxLength={200}
														onChange={(event) =>
															setGrid((current) =>
																updateTableCell(
																	current,
																	row,
																	col,
																	event.target.value,
																),
															)
														}
													/>
													<Button
														type="button"
														size="sm"
														variant="ghost"
														aria-label={`Tạo chỗ trống ô hàng ${row + 1} cột ${col + 1}`}
														disabled={!(grid.cells[row]?.[col] ?? "").trim()}
														onClick={() => {
															setGrid((current) =>
																toggleTableCell(current, row, col),
															);
															setActiveCell([row, col]);
														}}
													>
														____
													</Button>
												</div>
											)}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					variant="secondary"
					onClick={() => setGrid((current) => addTableRow(current))}
				>
					Thêm hàng
				</Button>
				<Button
					type="button"
					size="sm"
					variant="secondary"
					onClick={() => setGrid((current) => addTableCol(current))}
				>
					Thêm cột
				</Button>
			</div>

			{activeBlank && activeCell && (
				<div
					role="dialog"
					aria-label="Sửa chỗ trống bảng"
					className="flex flex-col gap-2 rounded-md border border-line bg-bg p-3"
				>
					<p className="font-medium text-muted-fg text-xs">
						Ô hàng {activeBlank.row + 1} — cột {activeBlank.col + 1}
					</p>
					<Input
						value={activeBlank.answer}
						aria-label="Đáp án ô trống"
						maxLength={200}
						onChange={(event) =>
							setGrid((current) =>
								updateTableBlank(current, activeBlank.row, activeBlank.col, {
									answer: event.target.value,
								}),
							)
						}
					/>
					<Input
						value={activeBlank.alts}
						aria-label="Chấp nhận thêm cho ô trống, cách nhau bằng /"
						placeholder="Nhận thêm: alt1 / alt2"
						maxLength={500}
						onChange={(event) =>
							setGrid((current) =>
								updateTableBlank(current, activeBlank.row, activeBlank.col, {
									alts: event.target.value,
								}),
							)
						}
					/>
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant="danger"
							onClick={() => {
								setGrid((current) =>
									toggleTableCell(current, activeBlank.row, activeBlank.col),
								);
								setActiveCell(null);
							}}
						>
							Bỏ chỗ trống
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setActiveCell(null)}
						>
							Đóng
						</Button>
					</div>
				</div>
			)}

			{issues.map((issue) => (
				<p key={issue} role="alert" className="text-danger text-xs">
					{issue}
				</p>
			))}

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					size="sm"
					disabled={!canApply}
					onClick={handleApply}
				>
					Áp vào bảng
				</Button>
				{willReplace && (
					<span className="text-[11px] text-meta">
						Áp vào bảng sẽ thay thế {items.length} câu hiện có.
					</span>
				)}
			</div>
		</div>
	);
}
