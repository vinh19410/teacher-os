import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const PHONE_DIGITS_RE = /^[0-9]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ModalMode = "existing" | "create";

/**
 * Issue #122: from a class detail page (`classId` present) the modal offers
 * two modes — pick an EXISTING org student (default while any student is not
 * yet enrolled) or create a new one. Without a `classId` (/students page)
 * only the create form exists, exactly as before.
 */
export function AddStudentModal({
	open,
	onClose,
	classId,
}: {
	open: boolean;
	onClose: () => void;
	classId?: string;
}) {
	const { data } = useData();
	const [mode, setMode] = useState<ModalMode>("create");
	const [selectedStudentId, setSelectedStudentId] = useState("");
	const [filter, setFilter] = useState("");
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [emailError, setEmailError] = useState<string | undefined>();
	const [parentName, setParentName] = useState("");
	const [nameError, setNameError] = useState<string | undefined>();
	const [phoneError, setPhoneError] = useState<string | undefined>();
	const { saving, error, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	const eligibleStudents = (() => {
		if (!classId) return [];
		const cls = data.classes.find((c) => c.id === classId);
		const enrolled = new Set(cls?.studentIds ?? []);
		return data.students.filter((s) => !enrolled.has(s.id));
	})();
	const hasEligible = eligibleStudents.length > 0;
	const effectiveMode: ModalMode = classId && hasEligible ? mode : "create";

	// Re-opening the modal (or switching target class via the host `key`)
	// must not inherit the previous session's mode, selection, or errors.
	// biome-ignore lint/correctness/useExhaustiveDependencies: open/classId are the reset triggers; resetFields is a stable closure over setters
	useEffect(() => {
		if (open) {
			setMode("existing");
			setSelectedStudentId("");
			setFilter("");
			resetFields();
		}
	}, [open, classId]);

	function resetFields() {
		setName("");
		setPhone("");
		setEmail("");
		setParentName("");
	}

	function switchMode(next: ModalMode) {
		setMode(next);
		setSelectedStudentId("");
		setFilter("");
	}

	const filteredStudents = eligibleStudents.filter((s) => {
		const q = filter.trim().toLowerCase();
		if (!q) return true;
		return s.name.toLowerCase().includes(q) || s.phone.includes(q);
	});
	const needsStudentSelection =
		effectiveMode === "existing" && !selectedStudentId;

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (effectiveMode === "existing") {
			if (!selectedStudentId) return;
			const result = await run({
				type: "enroll-student",
				classId: classId ?? "",
				studentId: selectedStudentId,
			});
			if (result?.kind === "refreshed") {
				resetFields();
				onClose();
			}
			return;
		}

		// Create mode validation: name, phone (digits only), email
		const trimmedName = name.trim();
		const trimmedEmail = email.trim();
		const hasNameError = !trimmedName;
		const hasPhoneError = !PHONE_DIGITS_RE.test(phone);
		const hasEmailError =
			trimmedEmail === ""
				? true // required
				: !EMAIL_RE.test(trimmedEmail);
		setNameError(hasNameError ? "Vui lòng nhập tên học viên." : undefined);
		setPhoneError(
			hasPhoneError ? "SĐT chỉ gồm chữ số, VD: 0901234567." : undefined,
		);
		setEmailError(
			hasEmailError
				? trimmedEmail === ""
					? "Vui lòng nhập email."
					: "Email không hợp lệ."
				: undefined,
		);
		if (hasNameError || hasPhoneError || hasEmailError) return;

		const result = await run({
			type: "add-student",
			payload: {
				name: trimmedName,
				phone,
				email: trimmedEmail,
				parentName,
				classId,
			},
		});
		if (result?.kind === "refreshed") {
			resetFields();
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			resetFields();
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title={
				effectiveMode === "existing" ? "Thêm học viên" : "Thêm học viên mới"
			}
		>
			<form noValidate onSubmit={submit}>
				{classId && (
					<div className="mb-5 flex gap-2">
						<Button
							type="button"
							variant={effectiveMode === "existing" ? "primary" : "secondary"}
							size="sm"
							onClick={() => switchMode("existing")}
							disabled={!hasEligible}
						>
							Học viên có sẵn
						</Button>
						<Button
							type="button"
							variant={effectiveMode === "create" ? "primary" : "secondary"}
							size="sm"
							onClick={() => switchMode("create")}
						>
							Tạo học viên mới
						</Button>
					</div>
				)}
				{effectiveMode === "existing" ? (
					<>
						<Field label="Tìm học viên">
							<Input
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								placeholder="Tên hoặc SĐT"
							/>
						</Field>
						<div
							className="flex max-h-52 flex-col gap-1 overflow-y-auto border border-line-soft border-solid p-2"
							role="listbox"
							aria-label="Danh sách học viên có sẵn"
						>
							{filteredStudents.length === 0 ? (
								<p className="px-1 py-2 text-muted-fg text-xs">
									Không có học viên phù hợp.
								</p>
							) : (
								filteredStudents.map((s) => (
									<button
										key={s.id}
										type="button"
										role="option"
										aria-selected={selectedStudentId === s.id}
										className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm ${
											selectedStudentId === s.id
												? "bg-accent-soft font-medium"
												: "hover:bg-line-soft"
										}`}
										onClick={() => setSelectedStudentId(s.id)}
									>
										<span>{s.name}</span>
										<span className="font-mono text-meta text-xs">
											{s.phone}
										</span>
									</button>
								))
							)}
						</div>
					</>
				) : (
					<>
						<Field label="Họ tên học viên *" error={nameError}>
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Nguyễn Văn A"
							/>
						</Field>
						<Field
							label="SĐT *"
							error={phoneError}
							help="Chỉ nhập chữ số, VD: 0901234567"
						>
							<Input
								value={phone}
								onChange={(e) => {
									setPhone(e.target.value.replace(/\D/g, ""));
									if (phoneError) setPhoneError(undefined);
								}}
								placeholder="0901234567"
								inputMode="numeric"
							/>
						</Field>
						<Field
							label="Email *"
							error={emailError}
							help="Dùng làm tài khoản đăng nhập cho học viên sau này"
						>
							<Input
								type="email"
								value={email}
								onChange={(e) => {
									setEmail(e.target.value);
									if (emailError) setEmailError(undefined);
								}}
								placeholder="hocvien@example.com"
							/>
						</Field>
						<Field label="Phụ huynh (nếu có)">
							<Input
								value={parentName}
								onChange={(e) => setParentName(e.target.value)}
								placeholder="Tên phụ huynh"
							/>
						</Field>
					</>
				)}
				<div className="flex flex-col gap-2">
					{error && (
						<p role="alert" className="text-danger text-xs">
							{error}
						</p>
					)}
					{notice && (
						<KernelSubmitNotice
							notice={notice}
							onReconcile={reconcileAndFinish}
							disabled={saving}
						/>
					)}
				</div>
				<div className="flex justify-end gap-2 border-line-soft border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={onClose}
						disabled={saving}
					>
						Hủy
					</Button>
					<Button
						type="submit"
						size="sm"
						disabled={saving || submitBlocked || needsStudentSelection}
					>
						Lưu
					</Button>
				</div>
			</form>
		</Modal>
	);
}
