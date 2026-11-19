import type { GoogleIntegrationStatus } from "@teacher-os/api/contracts";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { fetchGoogleIntegrationStatus } from "@/lib/repos/google-meet";

export interface LinkedAccountsState {
	/** true/false once loaded; null while nothing is known yet. */
	googleLinked: boolean | null;
	/** Detailed Calendar/Meet/Drive integration state; null if unavailable. */
	googleStatus: GoogleIntegrationStatus | null;
	loading: boolean;
	/** Set when listAccounts itself fails — the card must surface it (with a
	 * retry) instead of sticking on an empty state forever. */
	error: string | null;
	reload: () => Promise<void>;
}

export function useLinkedAccounts(): LinkedAccountsState {
	const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
	const [googleStatus, setGoogleStatus] =
		useState<GoogleIntegrationStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		setLoading(true);
		setError(null);
		const { data, error } = await authClient.listAccounts();
		if (error) {
			setError(
				error.message ||
					error.statusText ||
					"Không tải được trạng thái liên kết.",
			);
			setLoading(false);
			return;
		}
		const linked =
			Array.isArray(data) &&
			data.some((account) => account.providerId === "google");
		setGoogleLinked(linked);
		if (linked) {
			const status = await fetchGoogleIntegrationStatus().catch(() => null);
			setGoogleStatus(status);
		} else {
			setGoogleStatus(null);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	return { googleLinked, googleStatus, loading, error, reload };
}
