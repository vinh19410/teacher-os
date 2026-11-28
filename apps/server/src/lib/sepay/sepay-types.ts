import { z } from "zod";

/**
 * Webhook payload từ SePay cá nhân thường (my.sepay.vn → Webhooks).
 * Giữ schema lỏng với .passthrough() để tránh field drift làm mất delivery.
 */
export const sepayWebhookPayloadSchema = z
	.object({
		id: z
			.union([z.number(), z.string()])
			.transform((v) => String(v).trim())
			.refine((v) => v.length > 0),
		gateway: z.string().nullish(),
		transactionDate: z.string().nullish(),
		accountNumber: z.string().trim().min(1),
		subAccount: z.string().nullish(),
		code: z.string().nullish(),
		content: z.string().nullish(),
		transferType: z.string().min(1),
		description: z.string().nullish(),
		transferAmount: z.coerce.number(),
		accumulated: z.coerce.number().nullish(),
		referenceCode: z.string().nullish(),
	})
	.passthrough();

export type SepayWebhookPayload = z.infer<typeof sepayWebhookPayloadSchema>;

/**
 * Transaction item từ SePay API v2 (GET /v2/transactions).
 */
export const sepayV2TransactionSchema = z
	.object({
		id: z
			.union([z.string(), z.number()])
			.transform((v) => String(v).trim())
			.refine((v) => v.length > 0),
		transaction_date: z.string().nullish(),
		account_number: z.string().nullish(),
		va: z.string().nullish(),
		transfer_type: z.string().min(1),
		amount_in: z.coerce.number().default(0),
		amount_out: z.coerce.number().default(0),
		accumulated: z.coerce.number().nullish(),
		transaction_content: z.string().nullish(),
		reference_number: z.string().nullish(),
		code: z.string().nullish(),
		bank_brand_name: z.string().nullish(),
		bank_account_id: z.string().nullish(),
		va_id: z.string().nullish(),
		webhook_success: z.union([z.boolean(), z.number()]).nullish(),
	})
	.passthrough();

export const sepayV2TransactionListSchema = z.object({
	status: z.string().optional(),
	data: z.array(sepayV2TransactionSchema),
	meta: z
		.object({
			pagination: z
				.object({
					total: z.coerce.number().optional(),
					per_page: z.coerce.number().optional(),
					current_page: z.coerce.number().optional(),
					last_page: z.coerce.number().optional(),
					has_more: z.boolean().optional(),
				})
				.optional(),
		})
		.optional(),
});
