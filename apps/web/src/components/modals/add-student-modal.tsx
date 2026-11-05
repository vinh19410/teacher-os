import { STUDENT_INVITATION_ERROR_CODES } from "@teacher-os/api/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { PendingInviteCallout } from "@/components/students/pending-invite-callout";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AddStudentModalProps {
	open: boolean;
	onClose: () => void;
	defaultClassId?: string;
}

export function AddStudentModal({
	open,
	onClose,
	defaultClassId,
}: AddStudentModalProps) {
	const { data } = useData();
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [parentName, setParentName] = useState("");
	const [parentPhone, setParentPhone] = useState("");
	const [classId, setClassId] = useState(defaultClassId ?? "");
	const [activateNow, setActivateNow] = useState(true);
	const [nameError, setNameError] = useState<string | undefined>();
	const [emailError, setEmailError] = useState<string | undefined>();

	const {
		saving,
		error,
		failureError,
		notice,
		submitBlocked,
		run,
		reconcile,
		reset,
	} = useKernelFormSubmit();
	useEffect(() => {
		if (open) {
			setName("");
			setPhone("");
			setEmail("");
			setParentName("");
			setParentPhone("");
			setClassId(defaultClassId ?? "");
			setActivateNow(true);
			setNameError(undefined);
			setEmailError(undefined);
			reset();
		}
	}, [open, defaultClassId, reset]);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving || submitBlocked) return;

		const trimmedName = name.trim();
		const trimmedEmail = email.trim().toLowerCase();
		let hasError = false;

		if (!trimmedName) {
			setNameError("Vui lòng nhập họ tên học viên.");
			hasError = true;
		} else {
			setNameError(undefined);
		}

		if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
			setEmailError("Email không đúng định dạng.");
			hasError = true;
		} else {
			setEmailError(undefined);
		}

		if (hasError) return;

		const selectedClassId = (defaultClassId ?? classId).trim();
		const result = await run({
			type: "add-student",
			payload: {
				name: trimmedName,
				phone,
				email: trimmedEmail,
				parentName: parentName.trim(),
				parentPhone,
				...(selectedClassId ? { classId: selectedClassId } : {}),
				activateNow,
			},
		});

		if (result?.kind === "refreshed") {
			if (trimmedEmail && result.inviteEmailSent === false) {
				toast.warning(
					"Đã lưu hồ sơ học viên nhưng chưa gửi được email lời mời — bạn có thể bấm Gửi lại lời mời trong danh sách học viên.",
				);
			}
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			onClose();
		}
	}

	const trimmedCurrentEmail = email.trim().toLowerCase();
	const unjoinedConflict =
		failureError?.code === STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG &&
		failureError.portalLinked === false &&
		failureError.existingStudentId
			? {
					studentId: failureError.existingStudentId,
					studentName: failureError.existingStudentName,
				}
			: null;
	const joinedConflictError =
		failureError?.code === STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG &&
		failureError.portalLinked === true
			? failureError.existingStudentName
				? `Email này đã tham gia cổng học viên (${failureError.existingStudentName}).`
				: "Email này đã tham gia cổng học viên."
			: undefined;

	const effectiveClassId = (defaultClassId ?? classId).trim();

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Thêm học viên mới"
		>
			<form noValidate onSubmit={submit} className="flex flex-col gap-3">
				<Field label="Họ tên học viên *" required error={nameError}>
					<Input
						value={name}
						onChange={(e) => {
							setName(e.target.value);
							if (nameError) setNameError(undefined);
						}}
						placeholder="Nguyễn Văn A"
						disabled={saving}
					/>
				</Field>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Field label="Số điện thoại">
						<Input
							inputMode="numeric"
							value={phone}
							onChange={(e) =>
								setPhone(e.target.value.replace(/\D+/g, "").slice(0, 20))
							}
							placeholder="0901234567"
							disabled={saving}
						/>
					</Field>

					<Field
						label="Email"
						error={emailError}
						help="Tùy chọn. Nếu nhập email, học viên đăng nhập Student Portal bằng email này sẽ tự động khớp vào hồ sơ."
					>
						<Input
							type="email"
							value={email}
							onChange={(e) => {
								setEmail(e.target.value);
								if (emailError) setEmailError(undefined);
							}}
							placeholder="hocvien@example.com"
							disabled={saving}
						/>
					</Field>
				</div>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Field label="Tên phụ huynh">
						<Input
							value={parentName}
							onChange={(e) => setParentName(e.target.value)}
							placeholder="Trần Thị B"
							disabled={saving}
						/>
					</Field>

					<Field label="SĐT phụ huynh">
						<Input
							inputMode="numeric"
							value={parentPhone}
							onChange={(e) =>
								setParentPhone(e.target.value.replace(/\D+/g, "").slice(0, 20))
							}
							placeholder="0912345678"
							disabled={saving}
						/>
					</Field>
				</div>

				{!defaultClassId && data.classes.length > 0 && (
					<Field label="Ghi danh vào lớp (tùy chọn)">
						<Select
							value={classId}
							onChange={(e) => setClassId(e.target.value)}
							disabled={saving}
						>
							<option value="">— Chưa chọn lớp —</option>
							{data.classes.map((cls) => (
								<option key={cls.id} value={cls.id}>
									{cls.name}
								</option>
							))}
						</Select>
					</Field>
				)}

				{effectiveClassId && (
					<label className="flex cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={activateNow}
							onChange={(e) => setActivateNow(e.target.checked)}
							disabled={saving}
							className="h-4 w-4 rounded border-border"
						/>
						<span>Kích hoạt trạng thái Đang học ngay</span>
					</label>
				)}

				<div className="flex flex-col gap-2 empty:hidden">
					{unjoinedConflict && trimmedCurrentEmail ? (
						<PendingInviteCallout
							target={{
								kind: "student",
								studentId: unjoinedConflict.studentId,
								recipientLabel: trimmedCurrentEmail,
							}}
							studentName={unjoinedConflict.studentName}
							email={trimmedCurrentEmail}
							onResent={onClose}
						/>
					) : (
						(joinedConflictError ?? error) && (
							<p role="alert" className="text-danger text-xs">
								{joinedConflictError ?? error}
							</p>
						)
					)}
					{notice && (
						<KernelSubmitNotice
							notice={notice}
							onReconcile={reconcileAndFinish}
							disabled={saving}
						/>
					)}
				</div>

				<div className="flex justify-end gap-2 border-border border-t border-solid pt-4">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button type="submit" size="sm" disabled={saving || submitBlocked}>
						Lưu
					</Button>
				</div>
			</form>
		</Modal>
	);
}
