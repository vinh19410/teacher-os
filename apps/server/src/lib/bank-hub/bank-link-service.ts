import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { eq } from "drizzle-orm";
import type { Db } from "../../app";
import { type BankHubContext, BankHubError } from "./bank-hub-client";
import type { BankHubWebhookEvent } from "./bank-hub-types";

export type OrgBankLinkRow = typeof orgBankLink.$inferSelect;

/** Account display: keep only the last 4 digits visible in UI/DTOs. */
export function maskAccount(accountNumber: string): string {
	const tail = accountNumber.slice(-4);
	return tail ? `•••${tail}` : "•••";
}

function parsePastXids(
	row: Pick<OrgBankLinkRow, "pastBankAccountXids">,
): string[] {
	try {
		const parsed: unknown = JSON.parse(row.pastBankAccountXids || "[]");
		return Array.isArray(parsed)
			? parsed.filter((x): x is string => typeof x === "string")
			: [];
	} catch {
		return [];
	}
}

/**
 * Idempotently make sure the org has a Bank Hub company, recording its xid
 * in org_bank_link. The row is inserted (status "none") BEFORE createCompany
 * so a racing tab or webhook observes the in-flight state; after a duplicate
 * full_name 400 the loser re-reads the row the winner filled in. There is no
 * list/search-company API in Bank Hub, so a crash between createCompany and
 * the row update leaves the org with a one-click retry (new company create
 * fails again → row still empty → user-facing error), not silent corruption.
 */
export async function ensureCompany(
	db: Db,
	hub: BankHubContext,
	orgId: string,
): Promise<OrgBankLinkRow> {
	const read = () =>
		db.select().from(orgBankLink).where(eq(orgBankLink.orgId, orgId)).limit(1);
	const [existing] = await read();
	if (existing?.companyXid) return existing;

	await db
		.insert(orgBankLink)
		.values({ orgId, status: "none" })
		.onConflictDoNothing();
	const [afterInsert] = await read();
	if (afterInsert?.companyXid) return afterInsert;

	try {
		const company = await hub.client.createCompany({
			fullName: `teacheros-${orgId}`,
			status: "Active",
		});
		const [updated] = await db
			.update(orgBankLink)
			.set({ companyXid: company.xid, updatedAt: new Date() })
			.where(eq(orgBankLink.orgId, orgId))
			.returning();
		if (!updated) throw new Error("org_bank_link row disappeared");
		return updated;
	} catch (err) {
		// Duplicate full_name ⇒ the concurrent tab won; re-read its xid.
		if (err instanceof BankHubError && err.status === 400) {
			const [row] = await read();
			if (row?.companyXid) return row;
			throw new BankHubError(
				409,
				"Bank Hub company creation is still settling — retry",
			);
		}
		throw err;
	}
}

/**
 * Re-read the org's accounts from Bank Hub and refresh org_bank_link. The
 * client calls this after the hosted-link postMessage; it is also the
 * fallback when webhooks are lost. Picks deterministically (single active
 * account; ties by highest xid — the API exposes no ordering timestamp).
 * Sync advances last_event_at so a delayed webhook replay cannot overwrite
 * the fresher state, and moves a replaced bank_account_xid into
 * past_bank_account_xids for reconciliation coverage.
 */
export async function syncFromBankHub(
	db: Db,
	hub: BankHubContext,
	orgId: string,
): Promise<OrgBankLinkRow | undefined> {
	const read = () =>
		db.select().from(orgBankLink).where(eq(orgBankLink.orgId, orgId)).limit(1);
	const [row] = await read();
	if (!row?.companyXid) return row;

	const accounts = await hub.client.listBankAccounts(row.companyXid);
	const active = accounts.filter((a) => a.active);
	const chosen =
		active.length > 0
			? active.reduce((best, a) => (a.xid > best.xid ? a : best))
			: undefined;

	const now = new Date();
	const epochNow = Math.floor(Date.now() / 1000);
	const lastEventAt = Math.max(row.lastEventAt, epochNow);

	if (chosen) {
		const past = parsePastXids(row);
		const nextPast =
			row.bankAccountXid && row.bankAccountXid !== chosen.xid
				? Array.from(new Set([...past, row.bankAccountXid]))
				: past;
		const [updated] = await db
			.update(orgBankLink)
			.set({
				bankAccountXid: chosen.xid,
				pastBankAccountXids: JSON.stringify(nextPast),
				status: "linked",
				brandName: chosen.brandName,
				bankBin: chosen.bankBin,
				bankCode: chosen.bankCode,
				accountNumber: chosen.accountNumber,
				accountHolderName: chosen.accountHolderName,
				lastEventAt,
				linkedAt: row.linkedAt ?? now,
				updatedAt: now,
			})
			.where(eq(orgBankLink.orgId, orgId))
			.returning();
		return updated ?? row;
	}

	// No active account: a previously linked row went bank-side inactive
	// (teacher-initiated unlinks arrive as events, not via sync).
	const [updated] = await db
		.update(orgBankLink)
		.set({
			status: row.bankAccountXid ? "inactive" : "none",
			lastEventAt,
			updatedAt: now,
		})
		.where(eq(orgBankLink.orgId, orgId))
		.returning();
	return updated ?? row;
}

/**
 * Apply one BANK_ACCOUNT_* webhook event. Events are the only signal for
 * bank-initiated deactivations, so failures here lose state permanently —
 * but SePay retries only on network errors, hence the always-ack handler.
 * Guard rails: only the account currently recorded on the row may change it
 * (a second account in the same company must never overwrite), and stale
 * replays lose to last_event_at.
 */
export async function applyAccountEvent(
	db: Db,
	hub: BankHubContext,
	event: BankHubWebhookEvent,
): Promise<"applied" | "skipped"> {
	const accountXid =
		typeof event.metadata?.bank_account_xid === "string"
			? event.metadata.bank_account_xid
			: undefined;
	if (!accountXid) return "skipped";

	// BANK_ACCOUNT_LINKED carries no company_xid — resolve through the API
	// instead of trusting the payload.
	const account = await hub.client.getBankAccount(accountXid);
	const read = () =>
		db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.companyXid, account.companyXid))
			.limit(1);
	const [row] = await read();
	if (!row) return "skipped";
	if (row.bankAccountXid && row.bankAccountXid !== accountXid) return "skipped";
	if (event.timestamp < row.lastEventAt) return "skipped";

	const status = event.event.includes("UNLINK")
		? "unlinked"
		: event.event.includes("INACTIV")
			? "inactive"
			: "linked";
	const now = new Date();
	const [updated] = await db
		.update(orgBankLink)
		.set({
			bankAccountXid: accountXid,
			status,
			brandName: account.brandName || row.brandName,
			bankBin: account.bankBin || row.bankBin,
			bankCode: account.bankCode || row.bankCode,
			accountNumber: account.accountNumber || row.accountNumber,
			accountHolderName: account.accountHolderName || row.accountHolderName,
			lastEventAt: Math.max(event.timestamp, row.lastEventAt),
			linkedAt: status === "linked" ? (row.linkedAt ?? now) : row.linkedAt,
			updatedAt: now,
		})
		.where(eq(orgBankLink.orgId, row.orgId))
		.returning();
	return updated ? "applied" : "skipped";
}
