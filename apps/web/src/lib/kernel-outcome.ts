import { toast } from "sonner";
import type { KernelAction } from "./data-actions";
import type { KernelCommandResult } from "./repos/kernel";

export type DirectOutcomePlan = {
	toastKind: "success" | "info" | "error" | "warning";
	message: string;
	/** none = settled; check = reconcile after unknown; heal-409 = server state moved on. */
	reconcile: "none" | "check" | "heal-409";
};

const SET_MISMATCH_ACTIONS = new Set<KernelAction["type"]>([
	"delete-module",
	"delete-lesson",
	"reorder-modules",
	"reorder-lessons",
]);

/**
 * Pure decision table for direct (non-modal) kernel outcomes. 409 on these
 * actions is the server's duplicate-guard (e.g. "lesson is not upcoming"):
 * the write already landed earlier, so it must heal the stale store instead
 * of claiming "not saved". Reorder/delete 409 is set-mismatch — write refused.
 */
export function planDirectOutcome(
	result: KernelCommandResult,
	successText: string,
	actionType?: KernelAction["type"],
): DirectOutcomePlan {
	switch (result.kind) {
		case "refreshed":
			return { toastKind: "success", message: successText, reconcile: "none" };
		case "committed":
			return {
				toastKind: "info",
				message: "Đã lưu trên máy chủ nhưng chưa tải lại được dữ liệu.",
				reconcile: "none",
			};
		case "definite-failure":
			if (result.status === 409) {
				if (actionType && SET_MISMATCH_ACTIONS.has(actionType)) {
					return {
						toastKind: "info",
						message: "Thứ tự đã đổi — đang tải lại, hãy thao tác lại.",
						reconcile: "heal-409",
					};
				}
				return {
					toastKind: "info",
					message:
						"Dữ liệu đã được cập nhật trước đó — đang tải lại trạng thái mới nhất.",
					reconcile: "heal-409",
				};
			}
			return {
				toastKind: "error",
				message: "Không lưu được — dữ liệu chưa được ghi lên máy chủ.",
				reconcile: "none",
			};
		case "outcome-unknown":
			return {
				toastKind: "warning",
				message:
					"Không xác định được kết quả — có thể đã lưu. Đang tải lại để kiểm tra…",
				reconcile: "check",
			};
	}
}

/**
 * Visible outcome channel for direct (non-modal) kernel actions. The caller
 * owns pending state; this maps the discriminated result to a truthful toast
 * and reconciles the snapshot after an outcome-unknown or a 409 heal.
 */
export async function reportDirectOutcome(
	result: KernelCommandResult,
	successText: string,
	refresh: () => Promise<boolean>,
	actionType?: KernelAction["type"],
): Promise<void> {
	const plan = planDirectOutcome(result, successText, actionType);
	toast[plan.toastKind](plan.message);
	if (plan.reconcile === "none") return;
	if (await refresh()) {
		toast.info("Đã tải lại dữ liệu mới nhất — hãy kiểm tra lại.");
	} else {
		toast.error(
			"Không tải lại được dữ liệu — kiểm tra kết nối rồi kiểm tra lại.",
		);
	}
}

/**
 * Route-owned single-toast copy for occurrence actions (#98 Phase 4). The
 * caller passes the server result verbatim; counts come ONLY from the
 * `{updated, skipped}` payload (N2) — never from client snapshots. The new
 * 409 reasons get guidance instead of the generic heal-409 copy (N5):
 * `use-occurrence-endpoint` means nothing changed and the user aimed the
 * write at the wrong surface — point them at the ĐIỀU CHỈNH BUỔI flow.
 */
export function occurrenceSummary(
	result: KernelCommandResult,
	successText: string,
): { kind: "success" | "info" | "error"; message: string } {
	if (result.kind === "refreshed" || result.kind === "committed") {
		const updated = result.updated ?? 0;
		const skipped = result.skipped ?? 0;
		const total = updated + skipped;
		const suffix =
			skipped > 0 && total > 0
				? ` (${updated}/${total} học viên — ${skipped} đã chốt trước đó)`
				: "";
		const prefix =
			result.kind === "committed"
				? `${successText} Đã lưu nhưng chưa tải lại được dữ liệu.`
				: successText;
		return { kind: "success", message: `${prefix}${suffix}` };
	}
	if (result.kind === "definite-failure") {
		if (result.status === 409) {
			switch (result.reason) {
				case "use-occurrence-endpoint":
					return {
						kind: "info",
						message:
							"Bước này đổi thứ/buổi theo từng học viên — hãy dùng nút Điều chỉnh buổi.",
					};
				case "date-occupied":
					return {
						kind: "error",
						message: "Ngày đích đã có buổi khác — chọn ngày khác rồi lưu lại.",
					};
				default:
					break;
			}
		}
		if (result.status === 404) {
			return { kind: "info", message: "Buổi không còn tồn tại — đã tải lại." };
		}
		return {
			kind: "error",
			message: "Không lưu được — dữ liệu chưa được ghi lên máy chủ.",
		};
	}
	return {
		kind: "info",
		message:
			"Không xác định được kết quả — có thể đã lưu. Đang tải lại để kiểm tra…",
	};
}
