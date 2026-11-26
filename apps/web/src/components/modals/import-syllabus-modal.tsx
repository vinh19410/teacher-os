import { CURRICULUM_IMPORT_ERROR_CODES } from "@teacher-os/api/contracts";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import { canManageClassStatus } from "@teacher-os/auth/role";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { fmtDue } from "@/components/assignments/assignment-status";
import { TemplatePicker } from "@/components/syllabus/template-picker";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { type HttpError, isHttpError } from "@/lib/kernel-load-state";
import type { KernelCommandResult } from "@/lib/repos/kernel";
import { useClasses } from "@/lib/repos/use-classes";
import { useTemplates } from "@/lib/repos/use-syllabus";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";
import { KernelSubmitNotice } from "./kernel-submit-notice";

const MAX_CONFLICT_DATES_SHOWN = 6;
const MAX_OTHER_DATES_SHOWN = 4;

const conflictWeekdayFormatter = new Intl.DateTimeFormat("vi-VN", {
	weekday: "long",
	timeZone: "UTC",
});

function formatConflictDate(dateISO: string): string {
	const valid = parseStartDateStrict(dateISO);
	if (!valid) return dateISO;
	const date = new Date(`${valid}T00:00:00Z`);
	const weekday = conflictWeekdayFormatter.format(date);
	const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
	return `${capitalized}, ${fmtDue(valid)}`;
}

function importCurriculumErrorMessage(error: HttpError): string | undefined {
	switch (error.code) {
		case CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST:
			return "Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi nhập giáo trình.";
		case CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_COMPLETED: {
			const dates = error.completedDates ?? [];
			if (dates.length > 0) {
				const formatted = dates.slice(0, 4).map(formatConflictDate).join(", ");
				const extra =
					dates.length > 4 ? ` (+${dates.length - 4} buổi khác)` : "";
				return `Không thể ghi đè vì lớp đã có buổi học thủ công được điểm danh hoặc hoàn thành (${formatted}${extra}).`;
			}
			return "Không thể ghi đè vì lớp đã có buổi học thủ công được điểm danh hoặc hoàn thành.";
		}
		case CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_EMPTY_TEMPLATE:
			return "Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi nhập vào lớp trống.";
		case CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_TOO_MANY_LESSONS:
			return "Template vượt quá giới hạn 52 buổi học của lớp.";
		case CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_TEMPLATE_TOO_LARGE:
			return "Template quá lớn để import.";
		case CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_ALREADY_EXISTS:
			return "Lớp đã có giáo trình.";
		case CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_MATERIAL_NOT_FOUND:
			return "Một số tài liệu gắn trong template không còn tồn tại trong ngân hàng tài liệu.";
		case CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_INVALID_CLASS_SCHEDULE:
			return "Lớp cần có lịch học trong tuần và ngày khai giảng hợp lệ trước khi ghi đè buổi học thủ công bằng giáo trình.";
		case CURRICULUM_IMPORT_ERROR_CODES.CURRICULUM_HOLIDAY_SCAN_CAP:
			return "Kỳ nghỉ lễ hiện tại phủ kín lịch học nên không thể tự động tính ngày giáo trình. Vui lòng kiểm tra lại lịch nghỉ lễ.";
		case CURRICULUM_IMPORT_ERROR_CODES.CLASS_STATE_CHANGED:
			return "Trạng thái buổi học của lớp vừa thay đổi. Vui lòng thử nhập giáo trình lại.";
		case "FORBIDDEN":
			return "Chỉ giáo viên phụ trách hoặc quản trị viên mới có quyền ghi đè buổi học thủ công bằng giáo trình.";
		default:
			return undefined;
	}
}

interface PendingOverwriteState {
	templateId: string;
	conflictingDates: string[];
	otherManualDates: string[];
	manualSessionCount: number;
	overwriteHash: string;
	refreshedByRace?: boolean;
}

/**
 * Import a syllabus template into a class as its own curriculum copy
 * (issue #79). Lists templates only — a class copy is never importable.
 * When the class has uncompleted manual sessions, shows the overlapping
 * dates (and any other manual sessions to be replaced) and lets authorized
 * staff confirm an atomic overwrite.
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
	const formId = useId();
	const { data } = useData();
	const templates = useTemplates();
	const { classById } = useClasses();
	const canOverwrite = canManageClassStatus(data.viewer?.role ?? "teacher");
	// The list loads with the snapshot (may be empty on first paint), so the
	// stored id can go stale — always derive the effective selection.
	const [selectedId, setSelectedId] = useState("");
	const [pendingOverwrite, setPendingOverwrite] =
		useState<PendingOverwriteState | null>(null);
	const committedToastMessageRef = useRef<string | null>(null);
	const { saving, error, setError, notice, submitBlocked, run, reconcile } =
		useKernelFormSubmit();
	const wasOpenRef = useRef(false);
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			// Clear transient validation/conflict state on reopen, keeping `notice`
			// (`submitBlocked`) intact so committed/outcome-unknown never replays blindly.
			setError(undefined);
			setPendingOverwrite(null);
		}
		wasOpenRef.current = open;
	}, [open, setError]);
	const templateId = templates.some((t) => t.id === selectedId)
		? selectedId
		: (templates[0]?.id ?? "");

	const activeOverwrite =
		pendingOverwrite !== null &&
		pendingOverwrite.templateId === templateId &&
		!notice
			? pendingOverwrite
			: null;

	const className = classById(classId)?.name ?? "";

	function handleImportResult(
		result: KernelCommandResult | null,
		submittedTemplateId: string,
		isOverwriteAttempt: boolean,
	) {
		const overwriteSuccessMsg = "Đã ghi đè buổi thủ công và nhập giáo trình.";
		if (result?.kind === "refreshed") {
			committedToastMessageRef.current = null;
			setPendingOverwrite(null);
			if (isOverwriteAttempt) {
				toast.success(overwriteSuccessMsg);
			}
			onClose();
			return;
		}
		if (result?.kind === "committed") {
			setPendingOverwrite(null);
			committedToastMessageRef.current = isOverwriteAttempt
				? overwriteSuccessMsg
				: null;
			return;
		}
		if (result?.kind === "outcome-unknown") {
			setPendingOverwrite(null);
			committedToastMessageRef.current = null;
			return;
		}
		if (result?.kind === "definite-failure" && isHttpError(result.error)) {
			const httpErr = result.error;
			if (
				httpErr.code === CURRICULUM_IMPORT_ERROR_CODES.MANUAL_SESSIONS_EXIST &&
				httpErr.overwriteHash &&
				httpErr.manualSessionCount !== undefined &&
				httpErr.manualSessionCount > 0
			) {
				if (canOverwrite) {
					setPendingOverwrite({
						templateId: submittedTemplateId,
						conflictingDates: httpErr.conflictingDates ?? [],
						otherManualDates: httpErr.otherManualDates ?? [],
						manualSessionCount: httpErr.manualSessionCount,
						overwriteHash: httpErr.overwriteHash,
						refreshedByRace: isOverwriteAttempt,
					});
					setError(undefined);
				} else {
					setPendingOverwrite(null);
					setError(
						"Lớp đã có buổi học thủ công. Chỉ giáo viên phụ trách hoặc quản trị viên mới có quyền ghi đè buổi thủ công bằng giáo trình.",
					);
				}
				return;
			}
			setPendingOverwrite(null);
			const mapped = importCurriculumErrorMessage(httpErr);
			if (mapped) setError(mapped);
		}
	}

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (saving || submitBlocked || activeOverwrite !== null) return;
		if (!classId || !templateId) {
			onClose();
			return;
		}
		committedToastMessageRef.current = null;
		const result = await run({
			type: "import-curriculum",
			classId,
			templateId,
		});
		handleImportResult(result, templateId, false);
	}

	async function confirmOverwrite() {
		if (saving || submitBlocked || !activeOverwrite || !classId) return;
		committedToastMessageRef.current = null;
		const targetTemplateId = activeOverwrite.templateId;
		const result = await run({
			type: "import-curriculum",
			classId,
			templateId: targetTemplateId,
			overwriteManualSessions: true,
			overwriteHash: activeOverwrite.overwriteHash,
		});
		handleImportResult(result, targetTemplateId, true);
	}

	async function reconcileAndFinish() {
		const pendingToast = committedToastMessageRef.current;
		if (await reconcile()) {
			committedToastMessageRef.current = null;
			if (pendingToast) {
				toast.success(pendingToast);
			}
			onClose();
		}
	}

	const shownConflicts =
		activeOverwrite?.conflictingDates.slice(0, MAX_CONFLICT_DATES_SHOWN) ?? [];
	const hiddenConflicts = Math.max(
		0,
		(activeOverwrite?.conflictingDates.length ?? 0) - shownConflicts.length,
	);
	const shownOthers =
		activeOverwrite?.otherManualDates.slice(0, MAX_OTHER_DATES_SHOWN) ?? [];
	const hiddenOthers = Math.max(
		0,
		(activeOverwrite?.otherManualDates.length ?? 0) - shownOthers.length,
	);

	return (
		<Modal
			open={open}
			onClose={saving ? () => undefined : onClose}
			title="Nhập giáo trình từ template"
			scrollableBody
			footer={
				activeOverwrite ? (
					<>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={() => setPendingOverwrite(null)}
							disabled={saving || submitBlocked}
						>
							Quay lại
						</Button>
						<Button
							type="button"
							variant="danger"
							size="sm"
							onClick={() => void confirmOverwrite()}
							disabled={saving || submitBlocked || templates.length === 0}
						>
							{saving ? "Đang ghi đè…" : "Đồng ý ghi đè"}
						</Button>
					</>
				) : (
					<>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={onClose}
							disabled={saving}
						>
							Hủy
						</Button>
						<Button
							type="submit"
							form={formId}
							size="sm"
							disabled={saving || submitBlocked || templates.length === 0}
						>
							Nhập giáo trình
						</Button>
					</>
				)
			}
		>
			<form id={formId} onSubmit={submit}>
				<p className="text-muted-foreground text-sm">
					Lớp "{className}" nhận một bản sao riêng — chỉnh sửa trên lớp không
					ảnh hưởng template hay lớp khác.
				</p>
				{/* TemplatePicker dùng chung (issue #394) — tự render thông báo
				    khi danh sách rỗng; không allowEmpty vì import cần template. */}
				<TemplatePicker
					templates={templates}
					value={templateId}
					disabled={saving || submitBlocked}
					onChange={(nextId) => {
						setSelectedId(nextId);
						setError(undefined);
						setPendingOverwrite(null);
					}}
				/>
				{activeOverwrite && (
					<div
						role="alert"
						data-testid="curriculum-overwrite-warning"
						className="space-y-2 rounded-md border border-warn/50 bg-warn-soft p-3 text-foreground text-sm"
					>
						<p className="font-semibold text-warn">
							{activeOverwrite.conflictingDates.length > 0
								? `Phát hiện ${activeOverwrite.conflictingDates.length} buổi học thủ công trùng ngày với giáo trình`
								: `Lớp đang có ${activeOverwrite.manualSessionCount} buổi học thủ công`}
						</p>
						{activeOverwrite.refreshedByRace && (
							<p className="text-warn text-xs">
								Danh sách buổi học thủ công của lớp vừa thay đổi — vui lòng kiểm
								tra lại trước khi xác nhận.
							</p>
						)}
						{shownConflicts.length > 0 && (
							<div>
								<p className="text-muted-foreground text-xs">
									Các ngày trùng với lịch dự kiến của giáo trình:
								</p>
								<ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs tabular-nums">
									{shownConflicts.map((dateISO) => (
										<li key={dateISO}>{formatConflictDate(dateISO)}</li>
									))}
									{hiddenConflicts > 0 && (
										<li className="text-muted-foreground">
											+{hiddenConflicts} ngày trùng khác
										</li>
									)}
								</ul>
							</div>
						)}
						{shownOthers.length > 0 && (
							<div>
								<p className="text-muted-foreground text-xs">
									{activeOverwrite.conflictingDates.length > 0
										? `Ngoài ra còn ${activeOverwrite.otherManualDates.length} buổi thủ công ở ngày khác cũng sẽ bị thay thế khi chuyển lớp sang lịch giáo trình:`
										: "Áp dụng giáo trình sẽ chuyển hẳn lớp sang lịch tự động và thay thế toàn bộ các buổi thủ công sau:"}
								</p>
								<ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs tabular-nums">
									{shownOthers.map((dateISO) => (
										<li key={dateISO}>{formatConflictDate(dateISO)}</li>
									))}
									{hiddenOthers > 0 && (
										<li className="text-muted-foreground">
											+{hiddenOthers} ngày khác
										</li>
									)}
								</ul>
							</div>
						)}
						<p className="text-muted-foreground text-xs">
							Nếu đồng ý ghi đè, chủ đề, giờ học và tài liệu gắn riêng của buổi
							thủ công sẽ được thay bằng lịch giáo trình; link Zoom đã tạo cùng
							ngày (nếu có) được giữ lại. Hành động này không thể hoàn tác.
						</p>
					</div>
				)}
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
			</form>
		</Modal>
	);
}
