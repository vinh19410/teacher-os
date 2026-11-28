import {
	BANK_LINK_ERROR_CODES,
	type BankLinkStatus,
	bankLinkUpsertSchema,
} from "@teacher-os/api/contracts";
import {
	findVietnamBankByBin,
	normalizeBankAccountNumber,
} from "@teacher-os/api/lib/vietnam-banks";
import {
	formatTkpVaPrefix,
	matchesTkpVa,
	normalizeVaCode,
} from "@teacher-os/api/lib/vietqr";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { and, eq, ne } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import {
	clientTransactionToIngest,
	ingestTransaction,
} from "../lib/payments/ingest-transaction";
import { requireFinanceRole } from "../lib/require-finance-role";
import { type SepayContext, SepayError } from "../lib/sepay/sepay-client";

type Env = { Variables: { kernelCtx: KernelCtx } };
type BankLinkContext = Context<Env>;
type OrgBankLinkRow = typeof orgBankLink.$inferSelect;

/** Account display: keep only the last 4 digits visible in UI/DTOs. */
export function maskAccount(accountNumber: string): string {
	const tail = accountNumber.slice(-4);
	return tail ? `•••${tail}` : "•••";
}

function parsePastAccounts(raw: string | null | undefined): string[] {
	try {
		const parsed: unknown = JSON.parse(raw || "[]");
		return Array.isArray(parsed)
			? parsed.filter((x): x is string => typeof x === "string" && x.length > 0)
			: [];
	} catch {
		return [];
	}
}

function statusOf(row: OrgBankLinkRow | undefined): BankLinkStatus["status"] {
	const status = row?.status;
	return status === "linked" || status === "inactive" || status === "unlinked"
		? status
		: "none";
}

function toStatus(
	row: OrgBankLinkRow | undefined,
	reconcileEnabled: boolean,
): BankLinkStatus {
	const accountNumber = row?.accountNumber ?? "";
	return {
		enabled: true,
		reconcileEnabled,
		status: statusOf(row),
		brandName: row?.brandName ?? "",
		bankBin: row?.bankBin ?? "",
		bankCode: row?.bankCode ?? "",
		accountNumber,
		accountNumberMasked: accountNumber ? maskAccount(accountNumber) : "",
		vaCode: row?.vaCode ?? "",
		holderName: row?.accountHolderName ?? "",
		linkedAt: row?.linkedAt ? row.linkedAt.toISOString() : null,
	};
}

/**
 * Cấu hình tài khoản ngân hàng nhận học phí qua SePay cá nhân thường (#320),
 * mounted trong kernel tree (CSRF guard + org scoping + requireFinanceRole).
 */
export function bankLinkRoutes(deps: {
	getDb(): Db;
	getSepay?(): SepayContext | undefined;
}) {
	const router = new Hono<Env>();
	router.use("*", requireFinanceRole);

	function unauthorized(c: BankLinkContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	function sepayDisabled(c: BankLinkContext) {
		return c.json(
			{
				error: BANK_LINK_ERROR_CODES.SEPAY_DISABLED,
				code: BANK_LINK_ERROR_CODES.SEPAY_DISABLED,
			},
			503,
		);
	}

	async function readBody<S extends z.ZodType>(
		c: BankLinkContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: parsed.data };
	}

	function sepayFailure(c: BankLinkContext, err: SepayError): Response {
		console.error(
			`[sepay] ${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`,
		);
		if (err.status === 429) {
			c.header("Retry-After", String(err.retryAfter ?? 60));
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.SEPAY_RATE_LIMITED,
					code: BANK_LINK_ERROR_CODES.SEPAY_RATE_LIMITED,
				},
				429,
			);
		}
		return c.json(
			{
				error: BANK_LINK_ERROR_CODES.SEPAY_UPSTREAM,
				code: BANK_LINK_ERROR_CODES.SEPAY_UPSTREAM,
			},
			502,
		);
	}

	router.get("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const sepay = deps.getSepay?.();
		if (!sepay) return sepayDisabled(c);

		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.limit(1);
		return c.json(toStatus(row, Boolean(sepay.client)));
	});

	router.put("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const sepay = deps.getSepay?.();
		if (!sepay) return sepayDisabled(c);

		const body = await readBody(c, bankLinkUpsertSchema);
		if (!body.ok) return body.response;

		const bank = findVietnamBankByBin(body.data.bankBin);
		if (!bank) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.INVALID_BANK,
					code: BANK_LINK_ERROR_CODES.INVALID_BANK,
				},
				400,
			);
		}

		const normalizedAccount = normalizeBankAccountNumber(
			body.data.accountNumber,
		);
		const normalizedVaCode = normalizeVaCode(body.data.vaCode);
		const holderName = body.data.holderName.trim();
		const db = deps.getDb();

		// Mỗi cặp (STK, mã VA) đang active chỉ thuộc 1 org để webhook không bao giờ resolve nhầm org.
		// Nếu 1 org không đặt mã VA (nhận trực tiếp vào STK), không cho org khác dùng chung STK đó.
		const otherLinked = await db
			.select({
				orgId: orgBankLink.orgId,
				accountNumber: orgBankLink.accountNumber,
				vaCode: orgBankLink.vaCode,
			})
			.from(orgBankLink)
			.where(
				and(eq(orgBankLink.status, "linked"), ne(orgBankLink.orgId, ctx.orgId)),
			);
		const incomingVaPrefix = formatTkpVaPrefix(normalizedVaCode);
		const conflict = otherLinked.some((row) => {
			if (
				normalizeBankAccountNumber(row.accountNumber).toLowerCase() !==
				normalizedAccount.toLowerCase()
			) {
				return false;
			}
			const existingVaPrefix = formatTkpVaPrefix(row.vaCode);
			if (!existingVaPrefix || !incomingVaPrefix) return true;
			return existingVaPrefix === incomingVaPrefix;
		});
		if (conflict) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.ACCOUNT_ALREADY_IN_USE,
					code: BANK_LINK_ERROR_CODES.ACCOUNT_ALREADY_IN_USE,
				},
				409,
			);
		}

		const [existing] = await db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.limit(1);

		const past = parsePastAccounts(existing?.pastBankAccountXids);
		const nextPast =
			existing?.accountNumber &&
			normalizeBankAccountNumber(existing.accountNumber).toLowerCase() !==
				normalizedAccount.toLowerCase()
				? Array.from(
						new Set([
							...past,
							normalizeBankAccountNumber(existing.accountNumber),
						]),
					)
				: past;

		const now = new Date();
		let saved: OrgBankLinkRow | undefined;
		if (existing) {
			const [updated] = await db
				.update(orgBankLink)
				.set({
					companyXid: null,
					bankAccountXid: null,
					pastBankAccountXids: JSON.stringify(nextPast),
					status: "linked",
					brandName: bank.shortName,
					bankBin: bank.bin,
					bankCode: bank.code,
					accountNumber: normalizedAccount,
					vaCode: normalizedVaCode,
					accountHolderName: holderName,
					linkedAt: existing.linkedAt ?? now,
					updatedAt: now,
				})
				.where(eq(orgBankLink.orgId, ctx.orgId))
				.returning();
			saved = updated;
		} else {
			const [inserted] = await db
				.insert(orgBankLink)
				.values({
					orgId: ctx.orgId,
					companyXid: null,
					bankAccountXid: null,
					pastBankAccountXids: "[]",
					status: "linked",
					brandName: bank.shortName,
					bankBin: bank.bin,
					bankCode: bank.code,
					accountNumber: normalizedAccount,
					vaCode: normalizedVaCode,
					accountHolderName: holderName,
					linkedAt: now,
					updatedAt: now,
				})
				.returning();
			saved = inserted;
		}

		return c.json(toStatus(saved, Boolean(sepay.client)));
	});

	router.delete("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const sepay = deps.getSepay?.();
		if (!sepay) return sepayDisabled(c);

		const db = deps.getDb();
		const [existing] = await db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.limit(1);
		if (existing?.status !== "linked" || !existing.accountNumber) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.NO_LINKED_ACCOUNT,
					code: BANK_LINK_ERROR_CODES.NO_LINKED_ACCOUNT,
				},
				409,
			);
		}

		const past = parsePastAccounts(existing.pastBankAccountXids);
		const nextPast = Array.from(
			new Set([...past, normalizeBankAccountNumber(existing.accountNumber)]),
		);
		const now = new Date();
		const [updated] = await db
			.update(orgBankLink)
			.set({
				companyXid: null,
				bankAccountXid: null,
				pastBankAccountXids: JSON.stringify(nextPast),
				status: "none",
				brandName: "",
				bankBin: "",
				bankCode: "",
				accountNumber: "",
				vaCode: "",
				accountHolderName: "",
				linkedAt: null,
				updatedAt: now,
			})
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.returning();

		return c.json(toStatus(updated, Boolean(sepay.client)));
	});

	// Đối soát thủ công (#320): kéo giao dịch tiền vào 7 ngày gần nhất từ SePay API v2,
	// lọc theo STK/VA của org rồi đưa qua ingestTransaction (chống trùng 2 tầng).
	router.post("/reconcile", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const sepay = deps.getSepay?.();
		if (!sepay) return sepayDisabled(c);
		if (!sepay.client) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.SEPAY_RECONCILE_DISABLED,
					code: BANK_LINK_ERROR_CODES.SEPAY_RECONCILE_DISABLED,
				},
				503,
			);
		}

		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.limit(1);

		const currentAcc = normalizeBankAccountNumber(
			row?.accountNumber ?? "",
		).toLowerCase();
		const currentVaCode = normalizeVaCode(row?.vaCode ?? "");
		const pastAccounts = Array.from(
			new Set(
				parsePastAccounts(row?.pastBankAccountXids)
					.map((acc) => normalizeBankAccountNumber(acc).toLowerCase())
					.filter((acc) => Boolean(acc) && acc !== currentAcc),
			),
		);
		if (!row || (!currentAcc && pastAccounts.length === 0)) {
			return c.json({ scanned: 0, matched: 0, unmatched: 0 });
		}

		const nowSec = Math.floor(Date.now() / 1000);
		if (nowSec - row.lastReconciledAt < 60) {
			return c.json(
				{ error: "reconcile cooldown", code: "RECONCILE_COOLDOWN" },
				429,
			);
		}

		const startDate = new Date(Date.now() - 7 * 24 * 3600 * 1000)
			.toISOString()
			.slice(0, 10);
		const transactionDateFrom = `${startDate} 00:00:00`;

		let scanned = 0;
		let matched = 0;
		let unmatched = 0;

		try {
			for (let page = 1; page <= 5; page += 1) {
				const result = await sepay.client.listTransactions({
					transferType: "in",
					transactionDateFrom,
					page,
					perPage: 100,
				});
				for (const tx of result.data) {
					const acc = normalizeBankAccountNumber(
						tx.accountNumber,
					).toLowerCase();
					const va = normalizeBankAccountNumber(tx.va).toLowerCase();
					const matchesCurrent =
						currentAcc !== "" &&
						(currentVaCode !== ""
							? acc === currentAcc &&
								matchesTkpVa({
									vaCode: currentVaCode,
									subAccount: tx.va,
									content: tx.transactionContent,
								})
							: acc === currentAcc || (va !== "" && va === currentAcc));
					const matchesPast =
						(acc !== "" && pastAccounts.includes(acc)) ||
						(va !== "" && pastAccounts.includes(va));
					if (!matchesCurrent && !matchesPast) continue;

					scanned += 1;
					const outcome = await ingestTransaction(
						db,
						{
							...clientTransactionToIngest(tx),
							orgId: ctx.orgId,
						},
						{ saveNoCode: true },
					);
					if (outcome === "matched") matched += 1;
					else if (outcome === "unmatched") unmatched += 1;
				}
				if (!result.hasMore) break;
			}
		} catch (err) {
			if (err instanceof SepayError) return sepayFailure(c, err);
			throw err;
		}

		await db
			.update(orgBankLink)
			.set({ lastReconciledAt: nowSec, updatedAt: new Date() })
			.where(eq(orgBankLink.orgId, ctx.orgId));
		return c.json({ scanned, matched, unmatched });
	});

	return router;
}
