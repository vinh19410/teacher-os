import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useClasses } from "@/lib/repos/use-classes";
import { useSyllabus } from "@/lib/repos/use-syllabus";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

/**
 * Import a syllabus template into a class as its own curriculum copy
 * (issue #79). Lists templates only — a class copy is never importable.
 * The caller keeps this modal closed once the class has a curriculum;
 * the server still 409s on a race.
 */
export function ImportSyllabusModal({
	open,
	onClose,
	classId,
}: {
	open: boolean;
	onClose: () => void;
	classId: string;
}) {
	const { templates } = useSyllabus();
	const { classById } = useClasses();
	// The list loads with the snapshot (may be empty on first paint), so the
	// stored id can go stale — always derive the effective selection.
	const [selectedId, setSelectedId] = useState("");
	const { saving, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();
	const templateId = templates.some((t) => t.id === selectedId)
		? selectedId
		: (templates[0]?.id ?? "");

	const className = classById(classId)?.name ?? "";

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!classId || !templateId) {
			onClose();
			return;
		}
		const result = await run({
			type: "import-syllabus",
			classId,
			templateId,
		});
		if (result?.kind === "refreshed") {
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) onClose();
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Nhập giáo trình từ template"
		>
			<form onSubmit={submit}>
				<p className="text-muted-fg text-sm">
					Lớp "{className}" nhận một bản sao riêng — chỉnh sửa trên lớp không
					ảnh hưởng template hay lớp khác.
				</p>
				{templates.length === 0 ? (
					<p className="font-mono text-meta text-muted-fg text-xs">
						Chưa có template nào — tạo syllabus ở trang Syllabus trước.
					</p>
				) : (
					<Field label="Template">
						<Select
							value={templateId}
							onChange={(e) => setSelectedId(e.target.value)}
						>
							{templates.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</Select>
					</Field>
				)}
				{notice && (
					<KernelSubmitNotice
						notice={notice}
						onReconcile={reconcileAndFinish}
						disabled={saving}
					/>
				)}
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
						disabled={saving || submitBlocked || templates.length === 0}
					>
						Nhập giáo trình
					</Button>
				</div>
			</form>
		</Modal>
	);
}
