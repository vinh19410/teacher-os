import type { SyllabusBankMaterialRef } from "@teacher-os/api/material-contracts";
import { type FormEvent, useState } from "react";
import { MaterialPicker } from "@/components/materials/material-picker";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { CurriculumTarget } from "@/lib/data-actions";
import type { SyllabusLessonKind, SyllabusLessonStatus } from "@/lib/mock-data";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

export function AddLessonModal({
	open,
	onClose,
	target,
	moduleId,
	showKind,
	showStatus,
}: {
	open: boolean;
	onClose: () => void;
	target: CurriculumTarget;
	moduleId: string | null;
	/** Chỉ màn hình syllabus bật — loại buổi là nội dung giáo trình (#154). */
	showKind?: boolean;
	/** Chỉ màn hình lớp học bật — syllabus không sửa trạng thái buổi học. */
	showStatus?: boolean;
}) {
	const [title, setTitle] = useState("");
	const [objectives, setObjectives] = useState("");
	const [materials, setMaterials] = useState("");
	// Tài liệu ngân hàng chọn cho bài mới (#655) — chỉ materialIds đi lên payload.
	const [bankMaterials, setBankMaterials] = useState<SyllabusBankMaterialRef[]>(
		[],
	);
	const [kind, setKind] = useState<SyllabusLessonKind>("lesson");
	const [status, setStatus] = useState<SyllabusLessonStatus>("upcoming");
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();

	function resetForm() {
		setTitle("");
		setObjectives("");
		setMaterials("");
		setBankMaterials([]);
		setKind("lesson");
		setStatus("upcoming");
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!moduleId) return;
		if (!title.trim()) {
			setError("Vui lòng nhập tên buổi học.");
			return;
		}
		const result = await run({
			type: "add-lesson",
			target,
			moduleId,
			payload: {
				title: title.trim(),
				objectives: objectives.trim(),
				materials: materials.trim(),
				// Không showKind → không gửi key kind: server + reducer tự
				// default "lesson" (mirror showStatus, issue #154).
				...(showKind ? { kind } : {}),
				...(showStatus ? { status } : {}),
				// #655: chỉ gửi materialIds khi khác rỗng — thiếu key, server
				// default [] trên bài mới (nhất quán với add-manual-session).
				...(bankMaterials.length > 0
					? { materialIds: bankMaterials.map((m) => m.id) }
					: {}),
			},
		});
		if (result?.kind === "refreshed") {
			resetForm();
			onClose();
		}
	}

	async function reconcileAndFinish() {
		if (await reconcile()) {
			resetForm();
			onClose();
		}
	}

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Thêm buổi học"
		>
			<form noValidate onSubmit={submit}>
				<Field label="Tên buổi học *" error={error}>
					<Input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="VD: Line chart — Mô tả xu hướng"
					/>
				</Field>
				<Field label="Mục tiêu">
					<Textarea
						value={objectives}
						onChange={(e) => setObjectives(e.target.value)}
						placeholder="Học viên sẽ học gì trong buổi này?"
						rows={2}
					/>
				</Field>
				<Field label="Tài liệu">
					<Input
						value={materials}
						onChange={(e) => setMaterials(e.target.value)}
						placeholder="VD: Cam 15 Test 1 Task 1"
					/>
				</Field>
				{/* biome-ignore lint/a11y/useSemanticElements: role="group" + aria-label đặt tên nhóm tài liệu theo pattern ChipFilter cho SR/e2e */}
				<div
					role="group"
					aria-label="Tài liệu ngân hàng"
					className="grid gap-2"
				>
					<p className="font-medium text-sm leading-none">Tài liệu ngân hàng</p>
					<MaterialPicker
						selected={bankMaterials}
						onPick={(ref) =>
							setBankMaterials((prev) =>
								prev.some((m) => m.id === ref.id) ? prev : [...prev, ref],
							)
						}
						onRemove={(id) =>
							setBankMaterials((prev) => prev.filter((m) => m.id !== id))
						}
						disabled={saving}
					/>
				</div>
				{showKind && (
					<Field label="Loại buổi học">
						<Select
							value={kind}
							onChange={(e) => setKind(e.target.value as SyllabusLessonKind)}
						>
							<option value="lesson">Buổi học</option>
							<option value="midterm">Thi giữa kỳ</option>
							<option value="final">Thi cuối kỳ</option>
						</Select>
					</Field>
				)}
				{showStatus && (
					<Field label="Trạng thái">
						<Select
							value={status}
							onChange={(e) =>
								setStatus(e.target.value as SyllabusLessonStatus)
							}
						>
							<option value="upcoming">Sắp tới</option>
							<option value="current">Đang học</option>
							<option value="done">Đã dạy</option>
						</Select>
					</Field>
				)}
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
					<Button type="submit" size="sm" disabled={saving || submitBlocked}>
						Thêm buổi
					</Button>
				</div>
			</form>
		</Modal>
	);
}
