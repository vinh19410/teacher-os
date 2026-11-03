import { Check } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Issue #122 / Issue #257 / Issue #508: enroll an existing student OR create a
 * manual student directly into a class, with optional instant activation.
 */
export function EnrollStudentModal({
	open,
	onClose,
	classId,
}: {
	open: boolean;
	onClose: () => void;
	classId: string;
}) {
	const { data } = useData();
	const [mode, setMode] = useState<"existing" | "create">(() =>
		data.students.length === 0 ? "create" : "existing",
	);
	const [selectedStudentId, setSelectedStudentId] = useState("");
	const [filter, setFilter] = useState("");
	const [activateNow, setActivateNow] = useState(
		() => data.students.length === 0,
	);
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [parentName, setParentName] = useState("");
	const [parentPhone, setParentPhone] = useState("");
	const [nameError, setNameError] = useState<string | undefined>();
	const [emailError, setEmailError] = useState<string | undefined>();
	const { saving, error, notice, submitBlocked, run, reconcile, reset } =
		useKernelFormSubmit();
	const committedToastMessageRef = useRef<string | null>(null);

	const eligibleStudents = (() => {
		if (!classId) return [];
		const cls = data.classes.find((c) => c.id === classId);
		const enrolled = new Set([
			...(cls?.studentIds ?? []),
			...(cls?.invitedStudentIds ?? []),
		]);
		return data.students.filter((s) => !enrolled.has(s.id));
	})();

	function switchMode(nextMode: "existing" | "create") {
		setMode(nextMode);
		setActivateNow(nextMode === "create");
	}

	const wasOpenRef = useRef(false);
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			const initialMode = data.students.length === 0 ? "create" : "existing";
			setMode(initialMode);
			setSelectedStudentId("");
			setFilter("");
			setActivateNow(initialMode === "create");
			setName("");
			setPhone("");
			setEmail("");
			setParentName("");
			setParentPhone("");
			setNameError(undefined);
			setEmailError(undefined);
			committedToastMessageRef.current = null;
			reset();
		}
		wasOpenRef.current = open;
	}, [open, data.students.length, reset]);

	const filteredStudents = eligibleStudents.filter((s) => {
		const q = filter.trim().toLowerCase();
		if (!q) return true;
		return s.name.toLowerCase().includes(q) || s.phone.includes(q);
	});
	const needsStudentSelection = mode === "existing" && !selectedStudentId;

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving || submitBlocked) return;

		if (mode === "existing") {
			if (!selectedStudentId) return;
			const selectedStudentName = data.students
				.find((s) => s.id === selectedStudentId)
				?.name.trim();
			const successMessage = selectedStudentName
				? `Đã thêm ${selectedStudentName} vào lớp`
				: "Đã thêm học viên vào lớp";
			committedToastMessageRef.current = null;
			const result = await run({
				type: "enroll-student",
				classId,
				studentId: selectedStudentId,
				activateNow,
			});
			if (result?.kind === "refreshed") {
				toast.success(successMessage);
				setSelectedStudentId("");
				setFilter("");
				onClose();
			} else if (result?.kind === "committed") {
				committedToastMessageRef.current = successMessage;
			}
			return;
		}

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

		const successMessage = `Đã thêm ${trimmedName} vào lớp`;
		committedToastMessageRef.current = null;
		const result = await run({
			type: "add-student",
			payload: {
				name: trimmedName,
				phone,
				email: trimmedEmail,
				parentName: parentName.trim(),
				parentPhone,
				classId,
				activateNow,
			},
		});
		if (result?.kind === "refreshed") {
			toast.success(successMessage);
			setName("");
			setPhone("");
			setEmail("");
			setParentName("");
			setParentPhone("");
			onClose();
		} else if (result?.kind === "committed") {
			committedToastMessageRef.current = successMessage;
		}
	}

	async function reconcileAndFinish() {
		const pendingToastMessage = committedToastMessageRef.current;
		if (await reconcile()) {
			committedToastMessageRef.current = null;
			if (pendingToastMessage) {
				toast.success(pendingToastMessage);
			}
			setSelectedStudentId("");
			setFilter("");
			setName("");
			setPhone("");
			setEmail("");
			setParentName("");
			setParentPhone("");
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Thêm học viên vào lớp"
		>
			<form noValidate onSubmit={submit} className="flex flex-col gap-3">
				<div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
					<button
						type="button"
						onClick={() => switchMode("existing")}
						disabled={saving}
						className={`rounded px-3 py-1.5 font-medium text-xs transition-colors ${
							mode === "existing"
								? "bg-background text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Chọn học viên có sẵn
					</button>
					<button
						type="button"
						onClick={() => switchMode("create")}
						disabled={saving}
						className={`rounded px-3 py-1.5 font-medium text-xs transition-colors ${
							mode === "create"
								? "bg-background text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Tạo học viên mới
					</button>
				</div>

				{mode === "existing" ? (
					<>
						<Field label="Tìm học viên">
							<Input
								value={filter}
								onChange={(e) => setFilter(e.target.value)}
								placeholder="Tên hoặc SĐT"
							/>
						</Field>
						<div
							className="flex max-h-52 flex-col gap-1 overflow-y-auto border border-border border-solid p-2"
							role="listbox"
							aria-label="Danh sách học viên có sẵn"
						>
							{filteredStudents.length === 0 ? (
								data.students.length === 0 ? (
									<div className="flex flex-col items-start gap-2 px-1 py-2 text-muted-foreground text-xs">
										<p>Chưa có học viên nào trong tổ chức.</p>
										<Button
											type="button"
											variant="secondary"
											size="sm"
											onClick={() => switchMode("create")}
										>
											Tạo học viên mới ngay
										</Button>
									</div>
								) : (
									<p className="px-1 py-2 text-muted-foreground text-xs">
										{eligibleStudents.length === 0
											? "Tất cả học viên đã được thêm vào lớp."
											: "Không có học viên phù hợp."}
									</p>
								)
							) : (
								filteredStudents.map((s) => {
									const isSelected = selectedStudentId === s.id;
									return (
										<button
											key={s.id}
											type="button"
											role="option"
											aria-selected={isSelected}
											disabled={saving}
											className={cn(
												"flex items-center justify-between rounded-md border px-3 py-2 text-left text-foreground text-sm outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60",
												isSelected
													? "border-primary bg-muted font-medium ring-1 ring-primary"
													: "border-transparent hover:bg-accent hover:text-accent-foreground",
											)}
											onClick={() => setSelectedStudentId(s.id)}
										>
											<span>{s.name}</span>
											<span className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
												<span>{s.phone}</span>
												{isSelected ? (
													<Check
														aria-hidden="true"
														className="size-4 shrink-0 text-primary"
													/>
												) : null}
											</span>
										</button>
									);
								})
							)}
						</div>
					</>
				) : (
					<>
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
										setParentPhone(
											e.target.value.replace(/\D+/g, "").slice(0, 20),
										)
									}
									placeholder="0912345678"
									disabled={saving}
								/>
							</Field>
						</div>
					</>
				)}

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
				<div className="flex flex-col gap-2 empty:hidden">
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
				<div className="flex justify-end gap-2 border-border border-t border-solid pt-4">
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
