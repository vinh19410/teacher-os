import { z } from "zod";

/**
 * Zod DTOs for the SePay Bank Hub API (#320). Field shapes follow the fact
 * sheet in plans/261005-0754-sepay-bank-hub-tuition-qr/research; unknown
 * fields are stripped, missing required fields surface as BankHubError at
 * the call site. Convenience camelCase DTOs are mapped in bank-hub-client.
 */

export const bankHubTokenResponseSchema = z.object({
	access_token: z.string().min(1),
	ttl: z.coerce.number(),
});
// The token endpoint has no {data} envelope — fields sit at the top level of
// the 201 body.
export const bankHubTokenSchema = bankHubTokenResponseSchema;

/**
 * {code, data} envelope — confirmed on the company endpoints. /v1/token and
 * /v1/link-token/create return flat bodies instead; response shapes are not
 * uniform across endpoints, so never assume one from another.
 */
export function bankHubEnvelope<T extends z.ZodTypeAny>(data: T) {
	return z.object({
		code: z.unknown().optional(),
		message: z.unknown().optional(),
		data,
	});
}

export const bankHubCompanyRawSchema = z.object({
	xid: z.string(),
	full_name: z.string().optional(),
	status: z.union([z.string(), z.number()]).optional(),
	// Docs: numeric limit; the API reports "Unlimited" as the string.
	transaction_amount: z.union([z.string(), z.number()]).nullish(),
});

export const bankHubLinkTokenRawSchema = z.object({
	xid: z.string(),
	hosted_link_url: z.string().min(1),
	link_token: z.string(),
	expires_at: z.string(),
});

export const bankHubAccountRawSchema = z.object({
	xid: z.string(),
	company_xid: z.string().optional(),
	brand_name: z.string().nullish(),
	bank_bin: z.string().nullish(),
	bank_code: z.string().nullish(),
	account_holder_name: z.string().nullish(),
	account_number: z.string().nullish(),
	// SQLite-backed API: booleans serialize as "0"/"1" strings, not 0/1/bool.
	active: z.union([z.boolean(), z.number(), z.string()]).nullish(),
});

export const bankHubTransactionRawSchema = z.object({
	transaction_id: z.string().min(1),
	transaction_date: z.string().nullish(),
	bank_account_xid: z.string().nullish(),
	company_xid: z.string().nullish(),
	account_number: z.string().nullish(),
	reference_number: z.string().nullish(),
	transfer_type: z.string(),
	amount: z.coerce.number(),
	transaction_content: z.string().nullish(),
	payment_code: z.string().nullish(),
	webhook_success: z.union([z.boolean(), z.number()]).nullish(),
});

export const bankHubTransactionListSchema = z.object({
	data: z.array(bankHubTransactionRawSchema),
	meta: z
		.object({
			page: z.coerce.number(),
			per_page: z.coerce.number(),
			total: z.coerce.number(),
			total_pages: z.coerce.number(),
		})
		.partial()
		.optional(),
});

/** Bank Hub lifecycle webhook envelope (X-Secret-Key auth, phase 2). */
export const bankHubWebhookEventSchema = z.object({
	timestamp: z.coerce.number(),
	xid: z.string().optional(),
	version: z.string().optional(),
	event: z.string(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * IPN balance-change payload (Apikey auth, phase 4). Deliberately loose:
 * only the five fields the ingest needs are required — SePay does not retry
 * 4xx, so a strict schema would turn upstream field drift into a silent
 * total outage. Unknown fields pass through into the raw column.
 */
export const bankHubIpnSchema = z
	.object({
		transaction_id: z.string().min(1),
		transfer_type: z.string().min(1),
		amount: z.coerce.number(),
		bank_account_xid: z.string().min(1),
		content: z.string(),
		payment_code: z.string().nullish(),
		reference_code: z.string().nullish(),
		transaction_date: z.string().nullish(),
	})
	.passthrough();

export type BankHubWebhookEvent = z.infer<typeof bankHubWebhookEventSchema>;
export type BankHubIpn = z.infer<typeof bankHubIpnSchema>;
