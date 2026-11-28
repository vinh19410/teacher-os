import type { SepayClient, SepayContext, SepayTransaction } from "server/app";

export const E2E_SEPAY_WEBHOOK_SECRET = "e2e-sepay-webhook-secret";

/**
 * In-memory fake SePay context (#320) injected through AppDeps.getSepay in E2E.
 */
export interface FakeSepay {
	sepay: SepayContext;
	setTransactions(txs: SepayTransaction[]): void;
}

export function createFakeSepay(): FakeSepay {
	let transactions: SepayTransaction[] = [];

	const client: SepayClient = {
		listTransactions: async () => ({
			data: transactions,
			hasMore: false,
			currentPage: 1,
			lastPage: 1,
		}),
	};

	return {
		sepay: {
			webhookSecret: E2E_SEPAY_WEBHOOK_SECRET,
			client,
		},
		setTransactions(txs) {
			transactions = txs;
		},
	};
}
