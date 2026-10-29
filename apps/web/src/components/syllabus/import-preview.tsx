import type { SyllabusModuleContent } from "@teacher-os/api/contracts";
import { X } from "lucide-react";
import { LessonKindBadge } from "@/components/syllabus/lesson-kind";
import { Button } from "@/components/ui/button";
import type { SyllabusImportResult } from "@/lib/syllabus-import";

const PREVIEW_HEADERS = ["#", "Module", "Mục tiêu", "Tài liệu", "Loại"];

/**
 * Preview kết quả parse import Excel/CSV — dùng chung popup tạo syllabus và
 * màn hình syllabus detail (issue #152): bảng 5 cột khi ok (cột Loại #154),
 * danh sách lỗi (cap 100) khi lỗi, nút gỡ file trên cả hai nhánh.
 */
export function SyllabusImportPreview({
	result,
	onRemove,
	disabled = false,
}: {
	result: SyllabusImportResult | null;
	onRemove: () => void;
	disabled?: boolean;
}) {
	if (!result) return null;

	const removeFileButton = (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="px-1.5 text-muted-foreground hover:text-danger"
			onClick={onRemove}
			disabled={disabled}
			aria-label="Gỡ file"
			title="Gỡ file"
		>
			<X className="size-4" aria-hidden="true" />
		</Button>
	);

	if (!result.ok) {
		return (
			<div className="rounded-md border border-border border-solid bg-muted">
				<div className="flex items-center justify-between gap-2 px-3 py-2">
					<span className="text-danger text-xs">
						File có {result.errors.length} lỗi
					</span>
					{removeFileButton}
				</div>
				<ul
					role="alert"
					className="list-disc py-2 pr-3 pl-8 text-danger text-xs"
				>
					{result.errors.slice(0, 100).map((err, i) => (
						<li key={`${i}-${err}`}>{err}</li>
					))}
					{result.errors.length > 100 && (
						<li key="more-errors">
							…và {result.errors.length - 100} lỗi khác (sửa 100 lỗi đầu rồi
							nhập lại)
						</li>
					)}
				</ul>
			</div>
		);
	}

	return (
		<div className="rounded-md border border-border border-solid bg-muted">
			<div className="flex items-center justify-between gap-2 px-3 py-2">
				<span className="text-xs">
					{result.modules.length} module · {result.lessonCount} buổi học
				</span>
				{removeFileButton}
			</div>
			<div className="max-h-64 overflow-y-auto border-border border-t">
				<table className="w-full border-collapse text-xs">
					<thead>
						<tr>
							{PREVIEW_HEADERS.map((h) => (
								<th
									key={h}
									className="border-border border-b px-2 py-1.5 text-left text-[11px] text-muted-foreground uppercase tabular-nums tracking-[0.04em]"
								>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{result.modules.map((m, mi) =>
							m.lessons.map((l, li) => (
								<tr
									key={`${mi}-${li}-${l.title}`}
									className="border-border border-b"
								>
									<td className="px-2 py-1.5 text-muted-foreground">
										{lessonNumber(result.modules, mi, li)}
									</td>
									<td className="px-2 py-1.5">
										<span
											className="block max-w-[7rem] truncate"
											title={m.title}
										>
											{li === 0 ? m.title : ""}
										</span>
									</td>
									<td className="px-2 py-1.5">
										<span
											className="block max-w-[9rem] truncate"
											title={l.objectives}
										>
											{l.objectives}
										</span>
									</td>
									<td className="px-2 py-1.5">
										<span
											className="block max-w-[7rem] truncate"
											title={l.materials}
										>
											{l.materials}
										</span>
									</td>
									<td className="px-2 py-1.5">
										{/* Nhãn đầy đủ "Thi giữa kỳ"/"Thi cuối kỳ" — cùng
										    nguồn lessonKindLabel với syllabus detail (#154). */}
										<LessonKindBadge kind={l.kind} />
									</td>
								</tr>
							)),
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// Số thứ tự buổi toàn file cho cột `#` của bảng preview — cùng phép đếm
// với `lessonOrdinal` của parser, không parse ngược từ title.
function lessonNumber(
	modules: SyllabusModuleContent[],
	moduleIndex: number,
	lessonIndex: number,
): number {
	let before = 0;
	for (let i = 0; i < moduleIndex; i++) before += modules[i].lessons.length;
	return before + lessonIndex + 1;
}
