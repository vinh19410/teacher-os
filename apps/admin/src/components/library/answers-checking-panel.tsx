import { Card } from "@teacher-os/ui/components/web-kit/card";
import type { AnswerOverviewRow } from "./answers-overview";

/**
 * Panel "Kiểm tra đáp án" (#424 Task 4.3): bảng chỉ đọc toàn bộ đáp án
 * theo số câu fold, nhóm theo part. Nhảy tới câu qua `onJump` dùng cùng
 * đường đi với cây điều hướng (đổi part + focusTarget).
 */

export interface AnswersCheckingJump {
	part: string;
	group: number;
	question: number;
}

interface PartRows {
	part: string;
	label: string;
	rows: AnswerOverviewRow[];
}

function groupByPart(rows: readonly AnswerOverviewRow[]): PartRows[] {
	const order: string[] = [];
	const byPart = new Map<string, PartRows>();
	for (const row of rows) {
		let bucket = byPart.get(row.part);
		if (!bucket) {
			bucket = { part: row.part, label: row.partLabel, rows: [] };
			byPart.set(row.part, bucket);
			order.push(row.part);
		}
		bucket.rows.push(row);
	}
	return order.map((part) => byPart.get(part) as PartRows);
}

export function AnswersCheckingPanel({
	rows,
	onJump,
}: {
	rows: readonly AnswerOverviewRow[];
	onJump: (target: AnswersCheckingJump) => void;
}) {
	const total = rows.length;
	const missingCount = rows.filter((row) => row.missing).length;
	const parts = groupByPart(rows);

	return (
		<Card aria-label="Kiểm tra đáp án" className="gap-3 p-5">
			<h2 className="font-semibold text-base">Kiểm tra đáp án</h2>
			<p className="text-muted-foreground text-sm">
				{total} câu · {missingCount} câu thiếu đáp án
			</p>

			{total === 0 ? (
				<p className="text-muted-foreground text-sm">
					Chưa có câu hỏi nào để kiểm tra.
				</p>
			) : (
				<div className="flex flex-col gap-4">
					{parts.map((part) => (
						<section key={part.part} className="flex flex-col gap-1">
							<h3 className="font-medium text-sm">{part.label}</h3>
							<ul className="divide-y rounded-md border">
								{part.rows.map((row) => (
									<li
										key={row.number}
										className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm"
									>
										<button
											type="button"
											onClick={() =>
												onJump({
													part: row.part,
													group: row.groupIndex,
													question: row.questionOffset,
												})
											}
											className="min-w-8 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-xs tabular-nums hover:bg-accent"
										>
											{row.number}
										</button>
										{row.missing ? (
											<span className="flex items-center gap-1.5 text-amber-600 text-xs">
												<span
													aria-hidden="true"
													className="inline-block size-2 rounded-full bg-amber-500"
												/>
												Thiếu đáp án
											</span>
										) : (
											<span className="font-mono text-sm">
												{[row.answer, ...row.alts].join(" / ")}
											</span>
										)}
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			)}

			<p className="text-muted-foreground text-xs">
				Dán đáp án hàng loạt nằm trong tab Câu hỏi của từng nhóm.
			</p>
		</Card>
	);
}
