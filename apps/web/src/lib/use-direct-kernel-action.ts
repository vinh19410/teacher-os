import { useCallback, useState } from "react";
import { useData } from "@/lib/data-store";
import type { KernelAction } from "./data-actions";
import { reportDirectOutcome } from "./kernel-outcome";

/**
 * Direct (non-modal) kernel actions: awaits the discriminated result, blocks
 * any second action while one is pending, and surfaces the outcome via toast.
 * The `key` scopes the pending state to one target (lesson id, invoice id…).
 */
export function useDirectKernelAction() {
	const { dispatch, refresh } = useData();
	const [pendingKey, setPendingKey] = useState<string | null>(null);

	const run = useCallback(
		async (key: string, action: KernelAction, successText: string) => {
			if (pendingKey) return;
			setPendingKey(key);
			try {
				await reportDirectOutcome(await dispatch(action), successText, refresh);
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
