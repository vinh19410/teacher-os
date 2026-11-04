import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ResendInviteButton } from "@/components/students/pending-invite-callout";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import {
	formatRemainingVND,
	INVOICE_STATUS_LABEL,
	INVOICE_STATUS_VARIANT,
} from "@/lib/format-invoice";
import type { ClassGroup, KernelHydratedData, Student } from "@/lib/mock-data";
import type { RosterDebt } from "@/lib/tuition-from-kernel";
import type { DirectKernelAction } from "@/lib/use-direct-kernel-action";

export interface ClassRosterTabProps {
	cls: ClassGroup;
	data: KernelHydratedData;
	studentById: (id: string) => Student | undefined;
	rosterDebt: Map<string, RosterDebt>;
	run: DirectKernelAction["run"];
	busy: boolean;
}

/** Ô "Học phí" của tab Học viên (#322): badge trạng thái cùng nhãn/màu với
 * /tuition, kèm "còn X" — số tiền chưa thu của enrollment trong lớp, đã trừ
 * ledger partial (#320/#340, qua `formatRemainingVND` copy đơn nguồn). Ô này
 * không có cột Số tiền riêng nên nhãn hiện cho mọi hóa đơn chưa paid, kể cả
 * chưa thu gì. Overpay clamp (outstanding ≤ 0) chỉ hiện badge — tránh "còn
 * 0đ". Không entry trong map = "Chưa lập phiếu"; học viên được mời giữ
 * nguyên "—". */
export function RosterTuitionCell({
	debt,
	isInvited,
}: {
	debt?: RosterDebt;
	isInvited: boolean;
}) {
	if (isInvited) {
		return <span className="text-muted-foreground text-xs">—</span>;
	}
	if (!debt) {
		return <Badge variant="muted">Chưa lập phiếu</Badge>;
	}
	const badge = (
		<Badge variant={INVOICE_STATUS_VARIANT[debt.status]} dot>
			{INVOICE_STATUS_LABEL[debt.status]}
		</Badge>
	);
	if (debt.status === "paid" || debt.outstanding <= 0) {
		return badge;
	}
	return (
		<span className="flex items-center gap-2 whitespace-nowrap">
			{badge}
			<span
				className={cn(
					"tabular-nums",
					debt.status === "overdue" && "font-semibold text-danger",
				)}
			>
				{formatRemainingVND(debt.outstanding)}
			</span>
		</span>
	);
}

export function ClassRosterTab({
	cls,
	data,
	studentById,
	rosterDebt,
	run,
	busy,
}: ClassRosterTabProps) {
	const navigate = useNavigate();
	const [confirmAction, setConfirmAction] = useState<{
		type: "activate" | "delete";
		enrollmentId: string;
		studentName: string;
	} | null>(null);

	const activeStudents = cls.studentIds
		.map(studentById)
		.filter((s): s is Student => s !== undefined);
	const invitedStudents = (cls.invitedStudentIds ?? [])
		.map(studentById)
		.filter((s): s is Student => s !== undefined);
	const rosterEntries = [
		...activeStudents.map((s) => ({ student: s, isInvited: false })),
		...invitedStudents.map((s) => ({ student: s, isInvited: true })),
	];

	return (
		<>
			<Card className="p-0">
				<DataTable
					headers={[
						"Học viên",
						"Đăng ký",
						"Band mục tiêu",
						"Học phí",
						"Thao tác",
					]}
					emptyMessage="Chưa có học viên nào trong lớp."
					rows={rosterEntries.map(({ student: s, isInvited }) => {
						const en = data.enrollments.find(
							(e) => e.classId === cls.id && e.studentId === s.id,
						);
						return {
							onClick: () =>
								navigate({
									to: "/students/$studentId",
									params: { studentId: s.id },
								}),
							cells: [
								<div key="s" className="flex items-center gap-2">
									<Avatar text={s.avatar} size="sm" />
									{s.name}
								</div>,
								// #391: cột "Đăng ký" gộp trạng thái + số buổi còn lại
								// (design: Enrollment); band/skills xem ở hồ sơ học viên.
								<div key="e" className="flex items-center gap-2">
									{isInvited ? (
										<Badge variant="warn">Đã mời</Badge>
									) : (
										<Badge variant="success" dot>
											Đang học
										</Badge>
									)}
									<span className="text-muted-foreground text-xs tabular-nums">
										{isInvited ? "—" : `${s.pkg.remaining}/${s.pkg.total}`}
									</span>
								</div>,
								// #391: "Current band" của design không có data (Student
								// chỉ có targetBand) → hiện band mục tiêu, không bịa band
								// hiện tại.
								<span key="b" className="text-sm tabular-nums">
									Band {s.targetBand}
								</span>,
								<RosterTuitionCell
									key="fee"
									debt={rosterDebt.get(s.id)}
									isInvited={isInvited}
								/>,
								(isInvited && en) ||
								(Boolean(s.email) && s.portalLinked === false) ? (
									// biome-ignore lint/a11y/noStaticElementInteractions: wrapper chỉ stopPropagation để nút bấm không kích hoạt điều hướng của row
									<div
										className="flex flex-wrap items-center gap-2"
										onClick={(e) => e.stopPropagation()}
										onKeyDown={(e) => {
											if (e.key === " " || e.key === "Enter")
												e.stopPropagation();
										}}
									>
										{Boolean(s.email) &&
											(isInvited || s.portalLinked === false) && (
												<ResendInviteButton
													target={{
														kind: "student",
														studentId: s.id,
														...(isInvited && en ? { enrollmentId: en.id } : {}),
														recipientLabel: s.email,
													}}
													compact
												/>
											)}
										{isInvited && en && (
											<>
												<Button
													size="sm"
													variant="secondary"
													disabled={busy}
													onClick={() =>
														setConfirmAction({
															type: "activate",
															enrollmentId: en.id,
															studentName: s.name,
														})
													}
												>
													Kích hoạt
												</Button>
												<Button
													size="sm"
													variant="secondary"
													className="text-danger hover:text-danger"
													disabled={busy}
													onClick={() =>
														setConfirmAction({
															type: "delete",
															enrollmentId: en.id,
															studentName: s.name,
														})
													}
												>
													Hủy lời mời
												</Button>
											</>
										)}
									</div>
								) : (
									<span key="act" />
								),
							],
						};
					})}
				/>
			</Card>

			<Modal
				open={confirmAction !== null}
				onClose={busy ? () => undefined : () => setConfirmAction(null)}
				title={
					confirmAction?.type === "activate"
						? "Kích hoạt học viên?"
						: "Hủy lời mời tham gia lớp?"
				}
			>
				<p className="text-muted-foreground text-sm">
					{confirmAction?.type === "activate"
						? `Học viên "${confirmAction.studentName}" sẽ chuyển sang trạng thái Đang học và được tạo gói học cùng lịch các buổi học trong lớp.`
						: `Học viên "${confirmAction?.studentName}" sẽ bị xóa khỏi danh sách mời của lớp này. Bạn có thể mời lại sau.`}
				</p>
				<div className="mt-4 flex justify-end gap-2 border-border border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setConfirmAction(null)}
						disabled={busy}
					>
						Hủy
					</Button>
					<Button
						variant={confirmAction?.type === "activate" ? "primary" : "danger"}
						size="sm"
						disabled={busy}
						onClick={() => {
							if (!confirmAction) return;
							const { type, enrollmentId } = confirmAction;
							setConfirmAction(null);
							if (type === "activate") {
								void run(
									enrollmentId,
									{ type: "activate-enrollment", enrollmentId },
									"Đã kích hoạt học viên vào lớp.",
								);
							} else {
								void run(
									enrollmentId,
									{ type: "delete-enrollment", enrollmentId },
									"Đã hủy lời mời tham gia lớp.",
								);
							}
						}}
					>
						{confirmAction?.type === "activate" ? "Kích hoạt" : "Hủy lời mời"}
					</Button>
				</div>
			</Modal>
		</>
	);
}
