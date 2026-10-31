import {
	LEAD_COURSE_LABELS,
	LEAD_COURSES,
} from "@teacher-os/api/lead-contracts";
import {
	PLACEMENT_CEFR_MAX,
	PLACEMENT_MAX_BANDS,
	type PlacementBand,
	type PlacementPublishIssue,
} from "@teacher-os/api/placement-test-contracts";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { inputCls } from "@/components/ui/field";

export interface BandsEditorProps {
	bands: readonly PlacementBand[];
	totalQuestions: number;
	issues: readonly PlacementPublishIssue[];
	onUpdateBand: (index: number, patch: Partial<PlacementBand>) => void;
	onAddBand: () => void;
	onRemoveBand: (index: number) => void;
}

export function BandsEditor({
	bands,
	totalQuestions,
	issues,
	onUpdateBand,
	onAddBand,
	onRemoveBand,
}: BandsEditorProps) {
	const bandIssues = issues.filter(
		(item) => item.path === "bands" || item.path.startsWith("bands."),
	);

	return (
		<Card data-section="bands" className="flex flex-col gap-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-semibold text-foreground text-lg">
						Ngưỡng điểm CEFR & Khóa học gợi ý
					</h2>
					<p className="text-muted-foreground text-sm">
						Các ngưỡng phải liên tục từ <strong className="font-mono">0</strong>{" "}
						đến tổng điểm hiện tại là{" "}
						<strong className="font-mono" data-testid="total-questions-count">
							{totalQuestions}
						</strong>{" "}
						câu (không hở, không chồng lấn).
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={bands.length >= PLACEMENT_MAX_BANDS}
					onClick={onAddBand}
				>
					<Plus className="size-3.5" />
					Thêm ngưỡng
				</Button>
			</div>

			<div className="overflow-x-auto rounded-md border border-border">
				<table className="w-full text-left text-sm">
					<thead className="bg-muted/50 text-muted-foreground text-xs">
						<tr>
							<th className="px-3 py-2 font-medium">Điểm tối thiểu</th>
							<th className="px-3 py-2 font-medium">Điểm tối đa</th>
							<th className="px-3 py-2 font-medium">Mức CEFR</th>
							<th className="px-3 py-2 font-medium">Khóa học đề xuất</th>
							<th className="w-12 px-3 py-2 text-right font-medium">Xóa</th>
						</tr>
					</thead>
					<tbody>
						{bands.map((band, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: bands are edited in place by row index and never reordered
							<tr key={idx} className="border-border border-t">
								<td className="px-3 py-2">
									<input
										type="number"
										min={0}
										max={totalQuestions}
										aria-label={`Điểm tối thiểu ngưỡng ${idx + 1}`}
										value={band.min}
										onChange={(e) =>
											onUpdateBand(idx, {
												min: Math.max(0, Number(e.target.value) || 0),
											})
										}
										className={`${inputCls} h-8 w-24 tabular-nums`}
									/>
								</td>
								<td className="px-3 py-2">
									<input
										type="number"
										min={0}
										max={totalQuestions}
										aria-label={`Điểm tối đa ngưỡng ${idx + 1}`}
										value={band.max}
										onChange={(e) =>
											onUpdateBand(idx, {
												max: Math.max(0, Number(e.target.value) || 0),
											})
										}
										className={`${inputCls} h-8 w-24 tabular-nums`}
									/>
								</td>
								<td className="px-3 py-2">
									<input
										type="text"
										maxLength={PLACEMENT_CEFR_MAX}
										aria-label={`Mức CEFR ngưỡng ${idx + 1}`}
										value={band.cefr}
										onChange={(e) =>
											onUpdateBand(idx, { cefr: e.target.value })
										}
										placeholder="A1, A2, B1..."
										className={`${inputCls} h-8 w-28`}
									/>
								</td>
								<td className="px-3 py-2">
									<select
										aria-label={`Khóa học gợi ý ngưỡng ${idx + 1}`}
										value={band.course}
										onChange={(e) =>
											onUpdateBand(idx, { course: e.target.value })
										}
										className={`${inputCls} h-8 min-w-[220px]`}
									>
										{LEAD_COURSES.map((code) => (
											<option key={code} value={code}>
												{LEAD_COURSE_LABELS[code]}
											</option>
										))}
									</select>
								</td>
								<td className="px-3 py-2 text-right">
									<Button
										variant="outline"
										size="icon-sm"
										disabled={bands.length <= 1}
										onClick={() => onRemoveBand(idx)}
										aria-label={`Xóa ngưỡng ${idx + 1}`}
									>
										<Trash2 className="size-3.5 text-destructive" />
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{bandIssues.length > 0 && (
				<ul
					role="alert"
					className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs"
				>
					{bandIssues.map((issue) => (
						<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
					))}
				</ul>
			)}
		</Card>
	);
}
