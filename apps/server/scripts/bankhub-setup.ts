/**
 * One-time SePay Bank Hub merchant setup (#320) — run manually with the
 * production/sandbox credentials in env:
 *
 *   SEPAY_BANKHUB_BASE_URL=… SEPAY_BANKHUB_CLIENT_ID=… SEPAY_BANKHUB_CLIENT_SECRET=… \
 *   BANKHUB_WEBHOOK_URL=https://api.<domain>/webhooks/sepay/bankhub/events \
 *   BANKHUB_WEBHOOK_SECRET=… [BANKHUB_IPN_API_KEY=…] npx tsx apps/server/scripts/bankhub-setup.ts
 *
 * Registers the lifecycle webhook (X-Secret-Key) and the merchant keyword
 * whitelist ("TOS" — only tuition transfers reach the IPN). Never prints
 * secrets. Sandbox helpers (POST /v1/transaction/create) live here too —
 * they 403 on production, which is why they are NOT part of BankHubClient.
 */
import { BankHubError } from "../src/lib/bank-hub/bank-hub-client";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing env ${name}`);
		process.exit(1);
	}
	return value;
}

async function main() {
	const baseUrl = requireEnv("SEPAY_BANKHUB_BASE_URL");
	const clientId = requireEnv("SEPAY_BANKHUB_CLIENT_ID");
	const clientSecret = requireEnv("SEPAY_BANKHUB_CLIENT_SECRET");

	const webhookUrl = process.env.BANKHUB_WEBHOOK_URL;
	const webhookSecret = process.env.BANKHUB_WEBHOOK_SECRET;
	if (webhookUrl && webhookSecret) {
		const res = await fetch(`${baseUrl}/v1/webhook`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				webhook_url: webhookUrl,
				auth_type: "SECRET_KEY",
				secret_key: webhookSecret,
				active: 1,
				allow_events: ["*"],
			}),
		});
		console.log(`webhook: HTTP ${res.status} (upsert)`);
		if (!res.ok) console.error(await res.text());
	} else {
		console.log(
			"webhook: skipped (BANKHUB_WEBHOOK_URL / BANKHUB_WEBHOOK_SECRET unset)",
		);
	}

	const keywords = process.env.BANKHUB_REMARK_KEYWORDS ?? "TOS";
	const res = await fetch(`${baseUrl}/v1/merchant-config`, {
		method: "POST",
		headers: {
			Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			transaction_whitelist_remark_keywords: keywords
				.split(",")
				.map((k) => k.trim())
				.filter(Boolean),
		}),
	});
	console.log(`merchant-config: HTTP ${res.status} (keywords=${keywords})`);
	if (!res.ok) console.error(await res.text());

	if (process.env.BANKHUB_SANDBOX_TX === "1") {
		const accountXid = requireEnv("BANKHUB_SANDBOX_ACCOUNT_XID");
		const amount = Number(process.env.BANKHUB_SANDBOX_AMOUNT ?? "200000");
		const content =
			process.env.BANKHUB_SANDBOX_CONTENT ?? "tos7k2m9qxa hoc phi";
		try {
			const r = await fetch(`${baseUrl}/v1/transaction/create`, {
				method: "POST",
				headers: {
					Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					bank_account_xid: accountXid,
					transfer_type: "credit",
					amount,
					transaction_content: content,
				}),
			});
			console.log(`sandbox transaction/create: HTTP ${r.status}`);
			if (!r.ok) console.error(await r.text());
		} catch (err) {
			if (err instanceof BankHubError)
				console.error(`sandbox tx failed: ${err.status} ${err.message}`);
			else throw err;
		}
	}

	console.log("done (no secrets printed)");
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
