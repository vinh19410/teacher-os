import { type FormEvent, useEffect, useRef, useState } from "react";
import { TemplatePicker } from "@/components/syllabus/template-picker";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isHttpError } from "@/lib/kernel-load-state";
import { useClasses } from "@/lib/repos/use-classes";
import { useTemplates } from "@/lib/repos/use-syllabus";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

function importCurriculumErrorMessage(
	code: string | undefined,
): string | undefined {
	switch (code) {
		case "MANUAL_SESSIONS_EXIST":
			return "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.";
		case "CURRICULUM_EMPTY_TEMPLATE":
			return "Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.";
		case "CURRICULUM_TOO_MANY_LESSONS":
			return "Template vượt quá giới hạn 52 buổi học của lớp.";
		case "CURRICULUM_TEMPLATE_TOO_LARGE":
			return "Template quá lớn để import.";
		case "CURRICULUM_ALREADY_EXISTS":
			return "Lớp đã có giáo trình.";
		case "CURRICULUM_MATERIAL_NOT_FOUND":
			return "Một số tài liệu gắn trong template không còn tồn tại trong ngân hàng tài liệu.";
		default:
			return undefined;
	}
}
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
	const templates = useTemplates();
	const { classById } = useClasses();
	// The list loads with the snapshot (may be empty on first paint), so the
	// stored id can go stale — always derive the effective selection.
	const [selectedId, setSelectedId] = useState("");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();
	const wasOpenRef = useRef(false);
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			// Clear transient validation/conflict error on reopen, keeping `notice`
			// (`submitBlocked`) intact so committed/outcome-unknown never replays blindly.
			setError(undefined);
		}
		wasOpenRef.current = open;
	}, [open, setError]);
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
			type: "import-curriculum",
			classId,
			templateId,
		});
		if (result?.kind === "refreshed") {
			onClose();
			return;
		}
		if (result?.kind === "definite-failure" && isHttpError(result.error)) {
			const mapped = importCurriculumErrorMessage(result.error.code);
			if (mapped) setError(mapped);
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
				<p className="text-muted-foreground text-sm">
					Lớp "{className}" nhận một bản sao riêng — chỉnh sửa trên lớp không
					ảnh hưởng template hay lớp khác.
				</p>
				{/* TemplatePicker dùng chung (issue #394) — tự render thông báo
				    khi danh sách rỗng; không allowEmpty vì import cần template. */}
				<TemplatePicker
					templates={templates}
					value={templateId}
					onChange={(nextId) => {
						setSelectedId(nextId);
						setError(undefined);
					}}
				/>
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
						disabled={saving || submitBlocked || templates.length === 0}
					>
						Nhập giáo trình
					</Button>
				</div>
			</form>
		</Modal>
	);
}
