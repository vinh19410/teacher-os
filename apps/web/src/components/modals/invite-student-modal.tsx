import { STUDENT_INVITATION_ERROR_CODES } from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	PendingInviteCallout,
	type ResendInviteTarget,
} from "@/components/students/pending-invite-callout";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useInviteStudent } from "@/lib/repos/invitations";
export interface InviteStudentModalProps {
	open: boolean;
	onClose: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteStudentModal({ open, onClose }: InviteStudentModalProps) {
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pendingInvite, setPendingInvite] = useState<{
		target: ResendInviteTarget;
		studentName?: string;
		email: string;
	} | null>(null);
	const inviteMutation = useInviteStudent();

	useEffect(() => {
		if (open) {
			setEmail("");
			setError(null);
			setPendingInvite(null);
		}
	}, [open]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmedEmail = email.trim();

		if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
			setError("Email không đúng định dạng.");
			setPendingInvite(null);
			return;
		}

		setError(null);
		setPendingInvite(null);

		try {
			await inviteMutation.mutateAsync(trimmedEmail);
			toast.success(`Đã gửi lời mời tới ${trimmedEmail}`);
			setEmail("");
			onClose();
		} catch (err: unknown) {
			const record =
				err && typeof err === "object" ? (err as Record<string, unknown>) : {};
			const code = typeof record.code === "string" ? record.code : undefined;
			const message =
				typeof record.message === "string" ? record.message : undefined;
			if (code === STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG) {
				const existingStudentId =
					typeof record.existingStudentId === "string"
						? record.existingStudentId
						: undefined;
				const existingStudentName =
					typeof record.existingStudentName === "string"
						? record.existingStudentName
						: undefined;
				const portalLinked = record.portalLinked === true;
				if (!portalLinked && existingStudentId) {
					setPendingInvite({
						target: {
							kind: "student",
							studentId: existingStudentId,
							recipientLabel: trimmedEmail,
						},
						studentName: existingStudentName,
						email: trimmedEmail,
					});
				} else {
					setError(
						existingStudentName
							? `Email này đã tham gia cổng học viên (${existingStudentName}).`
							: "Email này đã tham gia cổng học viên.",
					);
				}
			} else if (
				code === STUDENT_INVITATION_ERROR_CODES.INVITATION_ALREADY_PENDING
			) {
				const invitationId =
					typeof record.invitationId === "string"
						? record.invitationId
						: undefined;
				if (invitationId) {
					setPendingInvite({
						target: {
							kind: "invitation",
							invitationId,
							email: trimmedEmail,
						},
						email: trimmedEmail,
					});
				} else {
					setError("Đã có lời mời đang chờ gửi tới email này.");
				}
			} else {
				setError(message || "Không thể gửi lời mời. Vui lòng thử lại sau.");
			}
		}
	};
	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Mời học viên vào tổ chức"
			footer={
				<div className="flex w-full items-center justify-end gap-2">
					<Button
						variant="ghost"
						onClick={onClose}
						disabled={inviteMutation.isPending}
					>
						Hủy
					</Button>
					<Button
						variant="primary"
						type="submit"
						form="invite-student-form"
						disabled={inviteMutation.isPending || !email.trim()}
					>
						{inviteMutation.isPending ? "Đang gửi..." : "Gửi lời mời"}
					</Button>
				</div>
			}
		>
			<form id="invite-student-form" onSubmit={handleSubmit} className="py-2">
				<p className="text-muted-foreground text-sm">
					Nhập địa chỉ email của học viên. Học viên sẽ nhận được thông báo tại
					icon chuông trên Student Portal để chấp nhận vào lớp học của bạn.
				</p>

				<Field label="Email học viên" required error={error ?? undefined}>
					<Input
						type="email"
						placeholder="hocvien@example.com"
						value={email}
						onChange={(e) => {
							setEmail(e.target.value);
							if (error) setError(null);
							if (pendingInvite) setPendingInvite(null);
						}}
						disabled={inviteMutation.isPending}
						autoFocus
					/>
				</Field>
				{pendingInvite && (
					<PendingInviteCallout
						target={pendingInvite.target}
						studentName={pendingInvite.studentName}
						email={pendingInvite.email}
						onResent={onClose}
					/>
				)}
			</form>
		</Modal>
	);
}
