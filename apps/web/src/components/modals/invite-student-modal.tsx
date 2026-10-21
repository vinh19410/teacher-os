import { STUDENT_INVITATION_ERROR_CODES } from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
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
	const inviteMutation = useInviteStudent();

	useEffect(() => {
		if (open) {
			setEmail("");
			setError(null);
		}
	}, [open]);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmedEmail = email.trim();

		if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
			setError("Email không đúng định dạng.");
			return;
		}

		setError(null);

		try {
			await inviteMutation.mutateAsync(trimmedEmail);
			toast.success(`Đã gửi lời mời tới ${trimmedEmail}`);
			setEmail("");
			onClose();
		} catch (err: unknown) {
			const errorObj = err as { code?: string; message?: string };
			if (errorObj.code === STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG) {
				setError("Email này đã là học viên trong tổ chức của bạn.");
			} else if (
				errorObj.code ===
				STUDENT_INVITATION_ERROR_CODES.INVITATION_ALREADY_PENDING
			) {
				setError("Đã có lời mời đang chờ gửi tới email này.");
			} else {
				setError(
					errorObj.message || "Không thể gửi lời mời. Vui lòng thử lại sau.",
				);
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
			<form
				id="invite-student-form"
				onSubmit={handleSubmit}
				className="flex flex-col gap-4 py-2"
			>
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
						}}
						disabled={inviteMutation.isPending}
						autoFocus
					/>
				</Field>
			</form>
		</Modal>
	);
}
