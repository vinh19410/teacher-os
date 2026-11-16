import {
	ASSIGNMENT_PROMPT_ERROR_CODES,
	ASSIGNMENT_TEST_ERROR_CODES,
	CLASS_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { useCallback, useState } from "react";
import { useData } from "@/lib/data-store";
import { type HttpError, isHttpError } from "@/lib/kernel-load-state";
import type { KernelAction } from "./data-actions";
import type { KernelCommandResult } from "./repos/kernel";

const GENERIC_FAILURE_MESSAGE =
	"Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại.";

/** Dedicated copy for 409 lock rejections: the write was refused because the
 * target is locked, so the generic "try again" message would mislead the
 * teacher about what happened and what to do next. Anything else keeps the
 * generic message. */
function lockFailureMessage(error: unknown): string {
	if (!isHttpError(error)) return GENERIC_FAILURE_MESSAGE;
	switch (error.code) {
		case ASSIGNMENT_PROMPT_ERROR_CODES.CONTENT_LOCKED:
			return "Đề đã có học viên làm bài nên không sửa được nội dung. Bạn vẫn có thể đổi tiêu đề, band, nguồn và trạng thái. Muốn đổi nội dung, hãy tạo đề mới.";
		case ASSIGNMENT_PROMPT_ERROR_CODES.WRITING_SECTION_LOCKED:
			return "Đề đã được giao hoặc đang dùng trong bộ đề nên không sửa được phần Writing. Hãy trả phần này về như cũ để lưu các thay đổi khác.";
		case ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED:
			return "Bộ đề đã có học viên làm bài nên không thể thay đổi hoặc gỡ part. Bạn vẫn có thể đổi tên, thời gian và trạng thái bộ đề. Muốn thay đổi đề, hãy tạo bộ đề mới.";
		case CLASS_ERROR_CODES.SCHEDULE_LOCKED:
			return "Lớp đã có buổi học thực tế nên không sửa được lịch học, ngày khai giảng hoặc số buổi. Bạn vẫn có thể lưu thay đổi thông tin chung của lớp.";
		case CLASS_ERROR_CODES.CLASS_PAUSED:
			return "Lớp đang tạm dừng — mở lại lớp để tiếp tục thao tác này.";
		default:
			return GENERIC_FAILURE_MESSAGE;
	}
}

export type KernelFormNotice =
	| { kind: "committed" } // saved server-side, snapshot refresh failed
	| { kind: "unknown" } // response lost — may or may not be saved
	| { kind: "reconcile-failed" };

/**
 * Shared submit flow for kernel form modals: awaits the discriminated result,
 * keeps the entered input on failure, and exposes the reconcile path for
 * committed/outcome-unknown. `run` and `reconcile` resolve `null`/`false`
 * while a submit is already pending (double-submit guard) and resolve the
 * result / `true` when the caller may close and reset.
 */
export interface KernelFormSubmitState {
	saving: boolean;
	error: string | undefined;
	failureError: HttpError | undefined;
	setError: (error: string | undefined) => void;
	notice: KernelFormNotice | undefined;
	submitBlocked: boolean;
	run: (action: KernelAction) => Promise<KernelCommandResult | null>;
	reconcile: () => Promise<boolean>;
	reset: () => void;
}

export function useKernelFormSubmit(): KernelFormSubmitState {
	const { dispatch, refresh } = useData();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [failureError, setFailureError] = useState<HttpError | undefined>();
	const [notice, setNotice] = useState<KernelFormNotice | undefined>();
	// A committed/unknown outcome must not offer a blind replay: the write may
	// already be saved server-side, so only a successful reconcile clears it.
	const submitBlocked = notice !== undefined;

	const run = useCallback(
		async (action: KernelAction): Promise<KernelCommandResult | null> => {
			if (saving || notice !== undefined) return null;
			setSaving(true);
			try {
				const result = await dispatch(action);
				if (result.kind === "refreshed") {
					setError(undefined);
					setFailureError(undefined);
					return result;
				}
				if (result.kind === "definite-failure") {
					const httpErr = isHttpError(result.error) ? result.error : undefined;
					setFailureError(httpErr);
					setError(lockFailureMessage(result.error));
					if (httpErr?.code === CLASS_ERROR_CODES.CLASS_PAUSED) {
						void refresh();
					}
					return result;
				}
				setError(undefined);
				setFailureError(undefined);
				setNotice(
					result.kind === "committed"
						? { kind: "committed" }
						: { kind: "unknown" },
				);
				return result;
			} finally {
				setSaving(false);
			}
		},
		[dispatch, refresh, saving, notice],
	);

	const reconcile = useCallback(async (): Promise<boolean> => {
		if (saving) return false;
		setSaving(true);
		try {
			const applied = await refresh();
			if (applied) {
				setNotice(undefined);
				setError(undefined);
				setFailureError(undefined);
				return true;
			}
			setNotice({ kind: "reconcile-failed" });
			return false;
		} finally {
			setSaving(false);
		}
	}, [refresh, saving]);

	/** Clear the submit outcome for a fresh form session. Call when the host
	 * modal re-opens or switches target (mirror the grade-modal reset) so a
	 * stale error/notice from target A never gates target B's submit. */
	const reset = useCallback(() => {
		setError(undefined);
		setFailureError(undefined);
		setNotice(undefined);
	}, []);

	return {
		saving,
		error,
		failureError,
		setError,
		notice,
		submitBlocked,
		run,
		reconcile,
		reset,
	};
}
