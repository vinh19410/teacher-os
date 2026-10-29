import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

/**
 * Issue #122 / Issue #257: enroll an EXISTING student into a class.
 * Students are registered/provisioned via the student portal.
 * This modal allows the teacher to select an eligible student and enroll them into the class.
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
	const [selectedStudentId, setSelectedStudentId] = useState("");
	const [filter, setFilter] = useState("");
	const { saving, error, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	const eligibleStudents = (() => {
		if (!classId) return [];
		const cls = data.classes.find((c) => c.id === classId);
		const enrolled = new Set([
			...(cls?.studentIds ?? []),
			...(cls?.invitedStudentIds ?? []),
		]);
		return data.students.filter((s) => !enrolled.has(s.id));
	})();

	useEffect(() => {
		if (open) {
			setSelectedStudentId("");
			setFilter("");
		}
	}, [open]);

	const filteredStudents = eligibleStudents.filter((s) => {
		const q = filter.trim().toLowerCase();
		if (!q) return true;
		return s.name.toLowerCase().includes(q) || s.phone.includes(q);
	});
	const needsStudentSelection = !selectedStudentId;

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving || !selectedStudentId) return;

		const result = await run({
			type: "enroll-student",
			classId,
			studentId: selectedStudentId,
		});
		if (result?.kind === "refreshed") {
			setSelectedStudentId("");
			setFilter("");
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			setSelectedStudentId("");
			setFilter("");
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Thêm học viên vào lớp"
		>
			<form noValidate onSubmit={submit}>
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
						<p className="px-1 py-2 text-muted-foreground text-xs">
							{eligibleStudents.length === 0
								? "Tất cả học viên đã được thêm vào lớp."
								: "Không có học viên phù hợp."}
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
										? "bg-accent font-medium"
										: "hover:bg-line-soft"
								}`}
								onClick={() => setSelectedStudentId(s.id)}
							>
								<span>{s.name}</span>
								<span className="text-muted-foreground text-xs">{s.phone}</span>
							</button>
						))
					)}
				</div>
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
