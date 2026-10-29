import type {
	BankHubAccount,
	BankHubClient,
	BankHubContext,
	BankHubLinkPurpose,
	BankHubTransaction,
} from "server/app";

/**
 * In-memory fake of the SePay Bank Hub + hosted-link page (#320), injected
 * through AppDeps.getBankHub like fs-media-store. The "hosted link" is a
 * page the same API server serves under /__fake-bankhub: clicking "Hoàn tất"
 * creates the linked account and postMessages FINISHED_BANK_ACCOUNT_LINK to
 * the parent window — the exact contract the real SePay iframe uses. The
 * account only exists AFTER completion, so /api/bank-link/sync models a real
 * round-trip instead of local fiction.
 */
export interface FakeBankHub {
	hub: BankHubContext;
	/** Serves GET/POST /__fake-bankhub/*; undefined for other paths. */
	handleFakePage(request: Request): Response | undefined;
}

export function createFakeBankHub(options: { origin: string }): FakeBankHub {
	const companyXidsByOrg = new Map<string, string>();
	const linkTokens = new Map<
		string,
		{ purpose: BankHubLinkPurpose; accountXid: string }
	>();
	const accounts = new Map<string, BankHubAccount & { linked: boolean }>();
	let companySeq = 0;
	let tokenSeq = 0;
	let accountSeq = 0;

	const client: BankHubClient = {
		createCompany: async (input) => {
			// full_name is unique per merchant — the org's row already carries
			// the company xid on repeat calls, so create runs once per org.
			const existing = companyXidsByOrg.get(input.fullName);
			if (existing)
				return {
					xid: existing,
					fullName: input.fullName,
					status: "Active",
					transactionAmount: 0,
				};
			companySeq += 1;
			const xid = `company-e2e-${companySeq}`;
			companyXidsByOrg.set(input.fullName, xid);
			return {
				xid,
				fullName: input.fullName,
				status: "Active",
				transactionAmount: 0,
			};
		},
		getCompany: async (xid) => ({
			xid,
			fullName: "",
			status: "Active",
			transactionAmount: "Unlimited",
		}),
		editCompany: async (xid) => ({
			xid,
			fullName: "",
			status: "Active",
			transactionAmount: "Unlimited",
		}),
		createLinkToken: async (input) => {
			tokenSeq += 1;
			const xid = `lt-e2e-${tokenSeq}`;
			accountSeq += 1;
			const accountXid = input.bankAccountXid ?? `ba-e2e-${accountSeq}`;
			linkTokens.set(xid, { purpose: input.purpose, accountXid });
			return {
				xid,
				// Absolute URL: the server route validates the origin against the
				// allowlist (localhost is allowed in sandbox mode), and the web
				// app's message listener compares against this origin.
				hostedLinkUrl: `${options.origin}/__fake-bankhub/link/${xid}`,
				linkToken: `tok-${xid}`,
				expiresAt: new Date(Date.now() + 600_000).toISOString(),
			};
		},
		getBankAccount: async (xid) => {
			const found = accounts.get(xid);
			if (!found) throw new Error(`fake-bankhub: unknown account ${xid}`);
			return found;
		},
		listBankAccounts: async () =>
			Array.from(accounts.values()).filter((a) => a.linked || a.active),
		listTransactions: async () => ({ data: [] as BankHubTransaction[] }),
		createMockTransaction: async (input) => {
			accountSeq += 1;
			return {
				transactionId: `txn-e2e-${accountSeq}`,
				referenceNumber: `FT-E2E-${accountSeq}`,
				transactionDate: new Date().toISOString(),
				amount: input.amount,
				transferType: input.transferType,
				accumulated: input.amount,
			};
		},
	};

	const page = (error?: string) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Fake Bank Hub</title></head>
<body style="font-family: system-ui; padding: 24px;">
	<h1 style="font-size:18px;">Fake Bank Hub — trang liên kết giả (E2E)</h1>
	${error ? `<p style="color:#b00">${error}</p>` : ""}
	<p>Nhấn "Hoàn tất" để mô phỏng OTP ngân hàng thành công.</p>
	<button id="done" style="padding:8px 16px;">Hoàn tất</button>
	<script>
		document.getElementById("done").addEventListener("click", async () => {
			const res = await fetch(window.location.pathname + "/complete", { method: "POST" });
			const data = await res.json();
			window.parent.postMessage({ event: data.event, metadata: data.metadata }, "*");
			document.getElementById("done").textContent = "Đã hoàn tất ✓";
		});
	</script>
</body></html>`;

	const handleFakePage = (request: Request): Response | undefined => {
		const url = new URL(request.url);
		if (!url.pathname.startsWith("/__fake-bankhub/")) return undefined;
		const parts = url.pathname.split("/").filter(Boolean);
		// ["__fake-bankhub", "link", ":token"(, "complete")]
		const token = parts[2] ?? "";
		const link = linkTokens.get(token);
		if (!link) return new Response("unknown link token", { status: 404 });
		if (parts[3] === "complete" && request.method === "POST") {
			accounts.set(link.accountXid, {
				xid: link.accountXid,
				companyXid: companyXidsByOrg.values().next().value ?? "company-e2e-1",
				brandName: "MBBank",
				bankBin: "970422",
				bankCode: "MB",
				accountHolderName: "NGUYEN VAN E2E",
				accountNumber: "0123456789",
				active: link.purpose !== "UNLINK_BANK_ACCOUNT",
				linked: true,
			});
			const event =
				link.purpose === "UNLINK_BANK_ACCOUNT"
					? "FINISHED_BANK_ACCOUNT_UNLINK"
					: "FINISHED_BANK_ACCOUNT_LINK";
			return Response.json({
				event,
				metadata: { bank_account_xid: link.accountXid },
			});
		}
		if (request.method === "GET") {
			return new Response(page(), {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}
		return new Response("method not allowed", { status: 405 });
	};

	return {
		hub: {
			client,
			ipnApiKey: "e2e-ipn-key",
			webhookSecret: "e2e-webhook-secret",
			env: "sandbox",
		},
		handleFakePage,
	};
}
