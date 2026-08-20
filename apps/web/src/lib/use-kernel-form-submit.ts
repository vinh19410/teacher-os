import { useCallback, useState } from "react";
import { useData } from "@/lib/data-store";
import type { KernelAction } from "./data-actions";
import type { KernelCommandResult } from "./repos/kernel";

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
export function useKernelFormSubmit() {
	const { dispatch, refresh } = useData();
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | undefined>();
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
					return result;
				}
				if (result.kind === "definite-failure") {
					setError(
						"Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại.",
					);
					return result;
				}
				setError(undefined);
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
		[dispatch, saving, notice],
	);

	const reconcile = useCallback(async (): Promise<boolean> => {
		if (saving) return false;
		setSaving(true);
		try {
			const applied = await refresh();
			if (applied) {
				setNotice(undefined);
				setError(undefined);
				return true;
			}
			setNotice({ kind: "reconcile-failed" });
			return false;
		} finally {
			setSaving(false);
		}
	}, [refresh, saving]);

	return { saving, error, setError, notice, submitBlocked, run, reconcile };
}
