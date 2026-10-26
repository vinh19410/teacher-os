/**
 * Bảng xem trước dời buổi (TOS-11 + TOS-12): mỗi dòng = một buổi gốc bị trùng
 * + ngày bù cuối khóa (đúng thứ + khung giờ chuẩn của lớp). TOS-12: ngày bù
 * nhảy qua kỳ nghỉ khác mang `*` ngay sau ngày bù và khối ghi chú dưới bảng
 * nêu tên kỳ nghỉ bị nhảy qua + tên lớp (D3); buổi có dòng đã điểm danh hiện
 * "Đã điểm danh" + Badge "Giữ nguyên — Đã diễn ra" (D4) và không được đếm
 * vào tiêu đề. Responsive: ≥768px bảng; <768px danh sách thẻ dọc.
 */
import type {
	HolidayPlannedShift,
	HolidayPreview,
} from "@teacher-os/api/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDayMonth } from "@/lib/week-grid";

const VI_WEEKDAYS: Record<number, string> = {
	1: "Thứ 2",
	2: "Thứ 3",
	3: "Thứ 4",
	4: "Thứ 5",
	5: "Thứ 6",
	6: "Thứ 7",
	7: "Chủ nhật",
};

function weekdayLabel(weekday: number): string {
	return VI_WEEKDAYS[weekday] ?? `T${weekday}`;
}

/** yyyy-mm-dd → lesson weekday 1-7 (Monday = 1) — cùng quy ước planner. */
function weekdayOfISO(iso: string): number {
	const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return weekday === 0 ? 7 : weekday;
}

/** Gom các ngày bị nhảy qua của một shift thành nhóm liền kề theo kỳ nghỉ
 * (cùng `holidayName`, kể cả null) — mỗi nhóm một câu ghi chú (red-team I3). */
function skipGroups(
	shift: HolidayPlannedShift,
): Array<{ holidayName: string | null; dates: string[] }> {
	const groups: Array<{ holidayName: string | null; dates: string[] }> = [];
	for (const skip of shift.skippedHolidays) {
		const last = groups[groups.length - 1];
		if (last && last.holidayName === skip.holidayName) {
			last.dates.push(skip.date);
		} else {
			groups.push({ holidayName: skip.holidayName, dates: [skip.date] });
		}
	}
	return groups;
}

/** Nhãn `*` sau ngày bù — trang trí, giải thích nằm ở khối ghi chú dưới bảng. */
function SkipMark() {
	return (
		<span className="text-muted-foreground" aria-hidden="true">
			*
		</span>
	);
}

export function HolidayPreviewTable({
	preview,
	loading,
	error,
	draftName = "",
}: {
	preview: HolidayPreview | null;
	loading: boolean;
	error: string | null;
	/** Tên kỳ nghỉ đang gõ trong form — điền cho `skippedHolidays` có
	 * `holidayName` null (kỳ đang tạo; previewKey cố ý bỏ `name` nên server
	 * không trả tên draft). */
	draftName?: string;
}) {
	if (loading) {
		return (
			<div
				data-testid="holiday-preview-loading"
				className="rounded-md border bg-muted px-3 py-4 text-center text-muted-foreground text-sm"
			>
				Đang tính buổi trùng…
			</div>
		);
	}
	if (error) {
		return (
			<div
				data-testid="holiday-preview-error"
				className="rounded-md border border-destructive/40 bg-destructive-soft px-3 py-3 text-destructive text-sm"
				role="alert"
			>
				{error}
			</div>
		);
	}
	if (!preview) return null;

	const hasAnyRow =
		preview.shifts.length > 0 ||
		preview.keptCompleted.length > 0 ||
		preview.unsupported.length > 0;

	if (!hasAnyRow) {
		return (
			<div
				data-testid="holiday-preview-empty"
				className="rounded-md border border-warn/50 bg-warn-soft px-3 py-3 text-sm text-warn"
			>
				Không có buổi học nào trong khoảng ngày đã chọn.
			</div>
		);
	}

	const shiftCount = preview.shifts.length;
	const skipNotes = preview.shifts.flatMap((shift) =>
		skipGroups(shift).map((group) => ({
			key: `${shift.classId}:${shift.originalDate}:${group.dates[0]}`,
			className: shift.className,
			name:
				group.holidayName ??
				(draftName.trim().length > 0 ? draftName.trim() : "kỳ nghỉ đang tạo"),
			datesLabel: group.dates.map((d) => formatDayMonth(d)).join(", "),
			targetLabel: `${weekdayLabel(shift.weekday)}, ${formatDayMonth(shift.makeupDate)}/${shift.makeupDate.slice(0, 4)}`,
		})),
	);

	return (
		<div data-testid="holiday-preview" className="flex flex-col gap-2">
			{/* D4: tiêu đề chỉ đếm shift — kept/unsupported không tính "xử lý". */}
			<div data-testid="holiday-preview-title" className="font-medium text-sm">
				{shiftCount} buổi sẽ được xử lý
			</div>
			{shiftCount === 0 && (
				<div
					data-testid="holiday-preview-none"
					className="rounded-md border border-warn/50 bg-warn-soft px-3 py-3 text-sm text-warn"
				>
					Không có buổi nào cần dời trong khoảng ngày đã chọn.
				</div>
			)}
			{/* Bảng cho ≥768px; danh sách thẻ cho nhỏ hơn — cùng dữ liệu. */}
			<div className="hidden overflow-x-auto md:block">
				<table className="w-full text-left text-sm">
					<thead>
						<tr className="border-b text-muted-foreground text-xs">
							<th scope="col" className="py-2 pr-3 font-medium">
								Lớp
							</th>
							<th scope="col" className="py-2 pr-3 font-medium">
								Buổi gốc
							</th>
							<th scope="col" className="py-2 pr-3 font-medium">
								Trạng thái
							</th>
							<th scope="col" className="py-2 font-medium">
								Kết quả
							</th>
						</tr>
					</thead>
					<tbody>
						{preview.shifts.map((shift) => (
							<tr
								key={`${shift.classId}:${shift.originalDate}`}
								className="border-b last:border-0"
							>
								<td className="py-2 pr-3 font-medium">{shift.className}</td>
								<td className="py-2 pr-3 tabular-nums">
									{weekdayLabel(weekdayOfISO(shift.originalDate))}
									{", "}
									{formatDayMonth(shift.originalDate)} · Buổi{" "}
									{shift.sessionOrdinal}
								</td>
								<td className="py-2 pr-3">
									<span className="inline-flex items-center rounded-md border border-warn/50 bg-warn-soft px-1.5 py-0.5 text-warn text-xs">
										Nghỉ lễ — Đã dời lịch
									</span>
								</td>
								<td className="py-2 tabular-nums">
									→ Dời sang {weekdayLabel(shift.weekday)},{" "}
									{formatDayMonth(shift.makeupDate)}
									{shift.skippedHolidays.length > 0 && <SkipMark />} ·{" "}
									{shift.time}
								</td>
							</tr>
						))}
						{preview.keptCompleted.map((kept) => (
							<tr
								key={`kept:${kept.classId}:${kept.date}`}
								className="border-b text-muted-foreground last:border-0"
							>
								<td className="py-2 pr-3">{kept.className}</td>
								<td className="py-2 pr-3 tabular-nums">
									{formatDayMonth(kept.date)} · Buổi {kept.sessionOrdinal}
								</td>
								<td className="py-2 pr-3">Đã điểm danh</td>
								<td className="py-2">
									<Badge variant="muted">(!) Giữ nguyên — Đã diễn ra</Badge>
								</td>
							</tr>
						))}
						{preview.unsupported.map((item) => (
							<tr
								key={`unsup:${item.classId}`}
								className="border-b text-muted-foreground last:border-0"
							>
								<td className="py-2 pr-3">{item.className}</td>
								<td className="py-2 pr-3" colSpan={3}>
									Không tự dời được (lịch cũ)
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<ul className="grid gap-2 md:hidden">
				{preview.shifts.map((shift) => (
					<li
						key={`card:${shift.classId}:${shift.originalDate}`}
						className="rounded-lg border border-warn/50 bg-warn-soft px-3 py-2 text-sm"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="font-medium">{shift.className}</span>
							<span className="inline-flex items-center rounded-md border border-warn/50 bg-warn-soft px-1.5 py-0.5 text-warn text-xs">
								Nghỉ lễ — Đã dời lịch
							</span>
						</div>
						<div className="text-muted-foreground text-xs tabular-nums">
							Buổi gốc: {formatDayMonth(shift.originalDate)} · Buổi{" "}
							{shift.sessionOrdinal}
						</div>
						<div className="mt-1 tabular-nums">
							→ Dời sang {weekdayLabel(shift.weekday)},{" "}
							{formatDayMonth(shift.makeupDate)}
							{shift.skippedHolidays.length > 0 && <SkipMark />} · {shift.time}
						</div>
					</li>
				))}
				{preview.keptCompleted.map((kept) => (
					<li
						key={`card-kept:${kept.classId}:${kept.date}`}
						className="rounded-lg border bg-muted px-3 py-2 text-muted-foreground text-sm"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span>
								{kept.className} · {formatDayMonth(kept.date)} · Buổi{" "}
								{kept.sessionOrdinal}
							</span>
							<span className="text-xs">Đã điểm danh</span>
						</div>
						<div className="mt-1">
							<Badge variant="muted">(!) Giữ nguyên — Đã diễn ra</Badge>
						</div>
					</li>
				))}
				{preview.unsupported.map((item) => (
					<li
						key={`card-unsup:${item.classId}`}
						className="rounded-lg border bg-muted px-3 py-2 text-muted-foreground text-sm"
					>
						{item.className} — Không tự dời được (lịch cũ)
					</li>
				))}
			</ul>
			{skipNotes.length > 0 && (
				<div data-testid="holiday-preview-notes">
					<Alert className="text-muted-foreground text-xs">
						<ul className="space-y-1">
							{skipNotes.map((note) => (
								<li key={note.key}>
									*Lớp {note.className}: ngày dự kiến {note.datesLabel} trùng «
									{note.name}» nên tự nhảy sang {note.targetLabel}
								</li>
							))}
						</ul>
					</Alert>
				</div>
			)}
		</div>
	);
}
