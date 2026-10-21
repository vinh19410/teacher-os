import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { fmtVND } from "@/lib/mock-data";
import type {
	StudentClassTuition,
	StudentTuitionSummary as Summary,
} from "@/lib/tuition-from-kernel";

/** #347 — thẻ KPI hiện "—" khi không lớp nào được cộng vào tổng. */
const EMPTY = "—";

/** Ô Còn lại: chưa thiết lập phí → "—"; chưa counted (invited/status lạ) →
 * giải thích chưa tính; counted thì đóng đủ (badge), đóng dư, hoặc số thiếu. */
function remainingCell(row: StudentClassTuition) {
	if (row.fee === null) return EMPTY;
	if (!row.counted) return "Chưa kích hoạt — chưa tính";
	if (row.overpaid > 0) return `Dư ${fmtVND(row.overpaid)}`;
	if (row.remaining === 0) return <Badge variant="success">Đã đóng đủ</Badge>;
	return <span className="font-mono">{fmtVND(row.remaining)}</span>;
}

/** Ô Học phí: chưa thiết lập hiện nhãn muted, có phí thì font-mono. */
function feeCell(row: StudentClassTuition) {
	if (row.fee === null) {
		return <span className="text-muted-foreground">Chưa thiết lập</span>;
	}
	return <span className="font-mono">{fmtVND(row.fee)}</span>;
}

/** Ô Lớp: link tới trang lớp (điểm vào duy nhất của dòng) + badge "Đã mời"
 * cho enrollment chưa active (kể cả status lạ — hiển thị như invited). */
function classCell(row: StudentClassTuition) {
	return (
		<div className="flex items-center gap-2">
			<Link
				to="/classes/$classId"
				params={{ classId: row.classId }}
				className="font-medium text-primary"
			>
				{row.className}
			</Link>
			{row.enrollmentStatus !== "active" && (
				<Badge variant="warn" className="px-1.5 py-0 text-[10px]">
					Đã mời
				</Badge>
			)}
		</div>
	);
}

/**
 * Tổng hợp học phí của học viên ở tab Học phí (#347): 3 thẻ Tổng / Đã đóng /
 * Còn lại tính từ các lớp counted + bảng theo lớp giải thích từng con số.
 * Bảng không onClick dòng — link lớp đã là điểm vào; tiền luôn font-mono
 * như bảng hóa đơn; Còn lại > 0 đỏ theo tiền lệ KPI trang Doanh thu.
 */
export function StudentTuitionSummary({ summary }: { summary: Summary }) {
	const counted = summary.countedClasses > 0;
	return (
		<div className="mb-5">
			<div
				className="grid grid-cols-3 gap-4 max-app:grid-cols-1"
				data-testid="tuition-stat-row"
			>
				<StatCard
					num={counted ? fmtVND(summary.totalFee) : EMPTY}
					label="Tổng học phí (VND)"
				/>
				<StatCard
					num={counted ? fmtVND(summary.totalPaid) : EMPTY}
					label="Đã đóng (VND)"
				/>
				<StatCard
					num={counted ? fmtVND(summary.totalRemaining) : EMPTY}
					label="Còn lại (VND)"
					// #347 tiền lệ KPI: còn nợ cần chú ý → thẻ hot (nền ink, số cam).
					hot={counted && summary.totalRemaining > 0}
				/>
			</div>
			{summary.unlinkedPaid > 0 && (
				<p className="mt-2 text-muted-foreground text-sm">
					Ngoài ra đã thu {fmtVND(summary.unlinkedPaid)} từ hóa đơn không gắn
					lớp.
				</p>
			)}
			{summary.classes.length === 0 ? (
				<p className="mt-5 text-muted-foreground text-sm">
					Chưa tham gia lớp học nào.
				</p>
			) : (
				<>
					{!counted && (
						<p className="mt-2 text-muted-foreground text-sm">
							Chưa lớp nào được thiết lập học phí. Thiết lập ở trang lớp.
						</p>
					)}
					<Card variant="white" className="mt-5 p-0">
						<DataTable
							headers={["Lớp", "Học phí", "Đã đóng", "Còn lại"]}
							rows={summary.classes.map((row) => ({
								cells: [
									classCell(row),
									feeCell(row),
									<span key="paid" className="font-mono">
										{fmtVND(row.paid)}
									</span>,
									remainingCell(row),
								],
							}))}
						/>
					</Card>
				</>
			)}
		</div>
	);
}
