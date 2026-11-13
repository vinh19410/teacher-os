import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TemplatePicker } from "@/components/syllabus/template-picker";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isHttpError } from "@/lib/kernel-load-state";
import type { ClassGroup } from "@/lib/mock-data";
import { useClasses } from "@/lib/repos/use-classes";
import {
	useClassCurriculumSyncState,
	useTemplates,
} from "@/lib/repos/use-syllabus";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

function syncCurriculumErrorMessage(
	code: string | undefined,
): string | undefined {
	switch (code) {
		case "MANUAL_SESSIONS_EXIST":
			return "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi đồng bộ giáo trình.";
		case "CURRICULUM_EMPTY_TEMPLATE":
			return "Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi đồng bộ.";
		case "CURRICULUM_TOO_MANY_LESSONS":
			return "Template vượt quá giới hạn 52 buổi học của lớp.";
		case "CURRICULUM_TEMPLATE_TOO_LARGE":
			return "Template quá lớn để đồng bộ.";
		case "CURRICULUM_MATERIAL_NOT_FOUND":
			return "Một số tài liệu gắn trong template không còn tồn tại trong ngân hàng tài liệu.";
		case "CURRICULUM_NOT_FOUND":
			return "Lớp chưa có giáo trình để đồng bộ.";
		case "CURRICULUM_SOURCE_TEMPLATE_MISSING":
			return "Template gốc đã bị xóa. Vui lòng chọn template khác để đồng bộ.";
		default:
			return undefined;
	}
}

function SyncBullets({
	cls,
	targetTotalLessons,
	hasRealSessions,
}: {
	cls: ClassGroup | undefined;
	targetTotalLessons: number;
	hasRealSessions?: boolean;
}) {
	return (
		<ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground text-sm">
			<li>
				Toàn bộ module, bài học, mục tiêu và tài liệu đính kèm sẽ được cập nhật
				theo template gốc (các chỉnh sửa riêng trên lớp sẽ bị ghi đè).
			</li>
			<li>
				Tiến độ bài học (Đã học / Đang học / Sắp tới) được giữ nguyên theo thứ
				tự buổi 1..N.
			</li>
			{cls && targetTotalLessons !== cls.sessionsTotal ? (
				<li>
					{hasRealSessions
						? `Lưu ý: Lớp đã có lịch buổi học thực tế (${cls.sessionsTotal} buổi) — lịch điểm danh và gói buổi của học viên vẫn giữ nguyên.`
						: `Tổng số buổi dự kiến của lớp sẽ cập nhật thành ${targetTotalLessons} buổi.`}
				</li>
			) : null}
		</ul>
	);
}

/**
 * Modal đồng bộ giáo trình lớp từ template gốc (hoặc template thay thế khi
 * template gốc đã bị xóa) (#700).
 */
export function SyncCurriculumModal({
	open,
	onClose,
	classId,
	hasRealSessions,
}: {
	open: boolean;
	onClose: () => void;
	classId: string;
	hasRealSessions?: boolean;
}) {
	const syncState = useClassCurriculumSyncState(classId);
	const templates = useTemplates();
	const { classById } = useClasses();
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

	if (syncState.kind === "no-curriculum") {
		return null;
	}

	const cls = classById(classId);
	const className = cls?.name ?? "";
	const isMissingSource = syncState.kind === "missing-source-template";
	const templateId = templates.some((t) => t.id === selectedId)
		? selectedId
		: (templates[0]?.id ?? "");
	const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving) return;
		if (!classId) {
			onClose();
			return;
		}
		if (isMissingSource && !templateId) {
			onClose();
			return;
		}
		const result = await run(
			isMissingSource
				? { type: "sync-curriculum", classId, templateId }
				: { type: "sync-curriculum", classId },
		);
		if (result?.kind === "refreshed") {
			toast.success("Đã đồng bộ giáo trình.");
			onClose();
			return;
		}
		if (result?.kind === "definite-failure" && isHttpError(result.error)) {
			const mapped = syncCurriculumErrorMessage(result.error.code);
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
			title={
				isMissingSource
					? "Đồng bộ giáo trình từ template khác"
					: "Đồng bộ lại giáo trình?"
			}
		>
			<form onSubmit={submit}>
				{isMissingSource ? (
					<>
						<p className="text-muted-foreground text-sm">
							Template gốc của lớp "{className}" đã bị xóa. Chọn một template
							khác để đồng bộ lại giáo trình.
						</p>
						<TemplatePicker
							templates={templates}
							value={templateId}
							onChange={(nextId) => {
								setSelectedId(nextId);
								setError(undefined);
							}}
						/>
						{selectedTemplate ? (
							<SyncBullets
								cls={cls}
								targetTotalLessons={selectedTemplate.totalLessons}
								hasRealSessions={hasRealSessions}
							/>
						) : null}
					</>
				) : (
					<>
						<p className="text-muted-foreground text-sm">
							Lớp "{className}" sẽ đồng bộ lại theo template "
							{syncState.sourceTemplate.name}" (
							{syncState.curriculum.totalLessons !==
							syncState.sourceTemplate.totalLessons
								? `${syncState.curriculum.totalLessons} buổi → ${syncState.sourceTemplate.totalLessons} buổi`
								: `${syncState.sourceTemplate.totalLessons} buổi`}
							).
						</p>
						<SyncBullets
							cls={cls}
							targetTotalLessons={syncState.sourceTemplate.totalLessons}
							hasRealSessions={hasRealSessions}
						/>
					</>
				)}

				{error && (
					<p role="alert" className="mt-3 text-danger text-xs">
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
						disabled={
							saving ||
							submitBlocked ||
							(isMissingSource && templates.length === 0)
						}
					>
						{isMissingSource ? "Đồng bộ giáo trình" : "Đồng bộ lại"}
					</Button>
				</div>
			</form>
		</Modal>
	);
}
