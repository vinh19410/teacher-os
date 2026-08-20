import { toast } from "sonner";
import type { KernelCommandResult } from "./repos/kernel";

export type DirectOutcomePlan = {
	toastKind: "success" | "info" | "error" | "warning";
	message: string;
	/** none = settled; check = reconcile after unknown; heal-409 = server state moved on. */
	reconcile: "none" | "check" | "heal-409";
};

/**
 * Pure decision table for direct (non-modal) kernel outcomes. 409 on these
 * actions is the server's duplicate-guard (e.g. "lesson is not upcoming"):
 * the write already landed earlier, so it must heal the stale store instead
 * of claiming "not saved".
 */
export function planDirectOutcome(
	result: KernelCommandResult,
	successText: string,
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
): Promise<void> {
	const plan = planDirectOutcome(result, successText);
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
