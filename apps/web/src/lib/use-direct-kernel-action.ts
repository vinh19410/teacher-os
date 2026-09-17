import { useCallback, useState } from "react";
import { useData } from "@/lib/data-store";
import type { KernelCommandResult } from "@/lib/repos/kernel";
import type { KernelAction } from "./data-actions";
import { reportDirectOutcome } from "./kernel-outcome";

export interface DirectKernelAction {
	run: (
		key: string,
		action: KernelAction,
		successText: string,
	) => Promise<KernelCommandResult>;
	isPending: (key: string) => boolean;
	busy: boolean;
}

/**
 * Direct (non-modal) kernel actions: awaits the discriminated result, blocks
 * any second action while one is pending, and surfaces the outcome via toast.
 * The `key` scopes the pending state to one target (lesson id, invoice id…).
 * Callers may inspect the returned result (issue #152: the overwrite-import
 * flow only clears its preview when the write certainly landed).
 */
export function useDirectKernelAction(): DirectKernelAction {
	const { dispatch, refresh } = useData();
	const [pendingKey, setPendingKey] = useState<string | null>(null);

	const run = useCallback(
		async (
			key: string,
			action: KernelAction,
			successText: string,
		): Promise<KernelCommandResult> => {
			// Busy-guard trả trước khi dispatch — không qua reportDirectOutcome
			// nên không phát sinh toast lỗi giả cho một hành động chưa xảy ra.
			if (pendingKey) {
				return {
					kind: "outcome-unknown",
					error: new Error(`busy: ${pendingKey}`),
				};
			}
			setPendingKey(key);
			try {
				const result = await dispatch(action);
				await reportDirectOutcome(result, successText, refresh, action.type);
				return result;
			} finally {
				setPendingKey(null);
			}
		},
		[dispatch, refresh, pendingKey],
	);

	const isPending = useCallback(
		(key: string) => pendingKey === key,
		[pendingKey],
	);

	return { run, isPending, busy: pendingKey !== null };
}
