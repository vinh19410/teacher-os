import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../../app";
import { type IngestInput, ingestTransaction } from "./ingest-transaction";
import { recordManualPayment } from "./record-manual-payment";

/**
 * Bounded-exhaustive check of the tuition ledger (skill `tuition-ledger-invariants`).
 * Runs every sequence of up to VERIFY_DEPTH operations drawn from OPS against
 * the real write paths (bank ingest, manual receipt, assign, ignore, mark-paid)
 * on an in-memory libsql, and checks the invariants after every step. Each
 * write path is one atomic D1 batch, so sequences of whole operations cover
 * every order the single-writer database can produce.
 */
const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);
const DEPTH = Number(process.env.VERIFY_DEPTH ?? 4);

const AMOUNT = 1000;
const CODE = "TOS11111111";
const FOREIGN_CODE = "TOS22222222";
const ACCOUNT = "acct-1";

type OpName =
	| "bankA600"
	| "bankB700"
	| "bankC300noCode"
	| "bankForeignCode500"
	| "manualK1_400"
	| "manualK2_700"
	| "markPaid"
	| "assignC"
	| "ignoreC";
const OPS: OpName[] = [
	"bankA600",
	"bankB700",
	"bankC300noCode",
	"bankForeignCode500",
	"manualK1_400",
	"manualK2_700",
	"markPaid",
	"assignC",
	"ignoreC",
];

const BANK: Record<string, { id: string; amount: number; content: string }> = {
	bankA600: { id: "A", amount: 600, content: `hoc phi ${CODE}` },
	bankB700: { id: "B", amount: 700, content: `hoc phi ${CODE}` },
	bankC300noCode: { id: "C", amount: 300, content: "chuyen khoan" },
	bankForeignCode500: { id: "F", amount: 500, content: `hp ${FOREIGN_CODE}` },
};

interface Snapshot {
	status: string;
	paidAmount: number;
	matchedSum: number;
	rows: number;
	foreignStatus: string;
	foreignPaid: number;
	foreignRows: number;
}

describe("tuition ledger invariants (bounded-exhaustive)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	const db = libsql as unknown as Db;
	let app: ServerApp;
	let orgId: string;
	let token: string;

	async function reset() {
		await client.execute("DELETE FROM payment_transaction");
		await client.execute("DELETE FROM invoice");
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, amount, status, payment_code)
			      VALUES ('inv', ?, 'stu', ?, 'unpaid', ?)`,
			args: [orgId, AMOUNT, CODE],
		});
		await client.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, amount, status, payment_code)
			      VALUES ('inv-foreign', 'org-other', 'stu-other', ?, 'unpaid', ?)`,
			args: [AMOUNT, FOREIGN_CODE],
		});
	}

	async function snapshot(): Promise<Snapshot> {
		const inv = (
			await client.execute(
				"SELECT status, paid_amount FROM invoice WHERE id = 'inv'",
			)
		).rows[0] as unknown as { status: string; paid_amount: number };
		const foreign = (
			await client.execute(
				"SELECT status, paid_amount FROM invoice WHERE id = 'inv-foreign'",
			)
		).rows[0] as unknown as { status: string; paid_amount: number };
		const ledger = (
			await client.execute(
				`SELECT COALESCE(SUM(CASE WHEN match_status = 'matched' THEN amount END), 0) AS s,
				        COUNT(*) AS n FROM payment_transaction WHERE invoice_id = 'inv'`,
			)
		).rows[0] as unknown as { s: number; n: number };
		const foreignLedger = (
			await client.execute(
				"SELECT COUNT(*) AS n FROM payment_transaction WHERE invoice_id = 'inv-foreign'",
			)
		).rows[0] as unknown as { n: number };
		return {
			status: inv.status,
			paidAmount: Number(inv.paid_amount),
			matchedSum: Number(ledger.s),
			rows: Number(ledger.n),
			foreignStatus: foreign.status,
			foreignPaid: Number(foreign.paid_amount),
			foreignRows: Number(foreignLedger.n),
		};
	}

	async function api(method: "POST", path: string, body: unknown) {
		return app.request(path, {
			method,
			headers: {
				cookie: `better-auth.session_token=${token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		});
	}

	/** Returns the manual-receipt outcome kind when the op is a manual receipt. */
	async function run(op: OpName): Promise<string | undefined> {
		const bank = BANK[op];
		if (bank) {
			const input: IngestInput = {
				transactionId: bank.id,
				transferType: "credit",
				amount: bank.amount,
				bankAccountXid: ACCOUNT,
				content: bank.content,
				paymentCode: null,
				referenceCode: "",
				transactionDate: "2026-01-01 00:00:00",
				rawJson: "{}",
			};
			await ingestTransaction(db, undefined, input, { saveNoCode: true });
			return undefined;
		}
		if (op === "manualK1_400" || op === "manualK2_700") {
			const [key, amount] = op === "manualK1_400" ? ["k1", 400] : ["k2", 700];
			const out = await recordManualPayment(db, {
				orgId,
				invoiceId: "inv",
				userId: "u-1",
				clientRequestId: key as string,
				amount: amount as number,
				method: "cash",
				note: "",
			});
			return out.kind;
		}
		if (op === "markPaid") {
			await api("POST", "/api/invoices/inv/mark-paid", { method: "Tiền mặt" });
		} else {
			const tx = (
				await client.execute({
					sql: "SELECT id FROM payment_transaction WHERE provider_txn_id = 'C' AND org_id = ?",
					args: [orgId],
				})
			).rows[0] as unknown as { id: string } | undefined;
			if (!tx) return undefined;
			if (op === "assignC") {
				await api("POST", `/api/payment-transactions/${tx.id}/assign`, {
					invoiceId: "inv",
				});
			} else {
				await api("POST", `/api/payment-transactions/${tx.id}/ignore`, {});
			}
		}
		return undefined;
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		token = crypto.randomUUID();
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const t = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (!t || t !== token) return null;
				return { userId: "u-1", userName: "Teacher", role: "teacher" as const };
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});
		await libsql
			.insert(authUser)
			.values({ id: "u-1", name: "Teacher", email: "u-1@test.local" });
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 3600_000),
			token,
			userId: "u-1",
		});
		await app.request("/api/kernel", {
			headers: { cookie: `better-auth.session_token=${token}` },
		});
		const m = await client.execute(
			"SELECT org_id FROM membership WHERE user_id = 'u-1'",
		);
		orgId = (m.rows[0] as unknown as { org_id: string }).org_id;
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu', ?, 'HV', '', '', '', 1)",
			args: [orgId],
		});
		await client.execute(
			"INSERT INTO organization (id, name, created_at) VALUES ('org-other', 'Org khác', 1)",
		);
		await client.execute(
			"INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-other', 'org-other', 'HV khác', '', '', '', 1)",
		);
		await client.execute({
			sql: "INSERT INTO org_bank_link (org_id, bank_account_xid) VALUES (?, ?)",
			args: [orgId, ACCOUNT],
		});
	});

	/** Shortest sequence that first violates each invariant, by invariant name. */
	const violations = new Map<string, OpName[]>();
	let explored = 0;

	function* sequences(max: number): Generator<OpName[]> {
		for (let len = 1; len <= max; len += 1) {
			const idx = new Array<number>(len).fill(0);
			while (true) {
				yield idx.map((i) => OPS[i] as OpName);
				let p = len - 1;
				while (p >= 0 && idx[p] === OPS.length - 1) {
					idx[p] = 0;
					p -= 1;
				}
				if (p < 0) break;
				idx[p] = (idx[p] as number) + 1;
			}
		}
	}

	function note(name: string, seq: OpName[], upTo: number) {
		if (!violations.has(name)) violations.set(name, seq.slice(0, upTo + 1));
	}

	test("explore every sequence", async () => {
		for (const seq of sequences(DEPTH)) {
			explored += 1;
			await reset();
			let prev = await snapshot();
			const seen = new Set<OpName>();
			for (let i = 0; i < seq.length; i += 1) {
				const op = seq[i] as OpName;
				const kind = await run(op);
				const cur = await snapshot();
				const isReplay = seen.has(op);
				seen.add(op);

				// L: paid_amount is always the matched ledger sum.
				if (cur.paidAmount !== cur.matchedSum) note("L-ledger-sum", seq, i);
				// S: `paid` is never left.
				if (prev.status === "paid" && cur.status !== "paid")
					note("S-paid-sticky", seq, i);
				// T: a fully covered invoice is `paid`.
				if (cur.matchedSum >= AMOUNT && cur.status !== "paid")
					note("T-covered-is-paid", seq, i);
				// R: repeating a keyed receipt (bank txn id / clientRequestId) changes
				// nothing. assign/ignore/mark-paid depend on state, so they are not keyed.
				if (
					isReplay &&
					(op in BANK || op.startsWith("manual")) &&
					(cur.rows !== prev.rows ||
						cur.paidAmount !== prev.paidAmount ||
						cur.status !== prev.status)
				)
					note("R-replay-noop", seq, i);
				// X: money for another org's code never touches that org's invoice or lands in its ledger.
				if (
					cur.foreignStatus !== "unpaid" ||
					cur.foreignPaid !== 0 ||
					cur.foreignRows !== 0
				)
					note("X-tenant-isolation", seq, i);
				// M: an accepted manual receipt never pushes the matched sum past the amount.
				if (kind === "created" && cur.matchedSum > AMOUNT)
					note("M-manual-no-overpay", seq, i);
				// O: nothing ever pushes the matched sum past the amount.
				if (cur.matchedSum > AMOUNT) note("O-no-overpay", seq, i);
				prev = cur;
			}
		}
	}, 600_000);

	test("explored the whole bounded space", () => {
		expect(explored).toBe(
			Array.from({ length: DEPTH }, (_, k) => OPS.length ** (k + 1)).reduce(
				(a, b) => a + b,
				0,
			),
		);
	});

	for (const name of [
		"L-ledger-sum",
		"S-paid-sticky",
		"T-covered-is-paid",
		"R-replay-noop",
		"X-tenant-isolation",
		"M-manual-no-overpay",
	]) {
		test(name, () => {
			expect(
				violations.get(name),
				`counterexample for ${name}`,
			).toBeUndefined();
		});
	}

	// KNOWN FINDING (see the skill's "Findings" section): bank credits are real
	// money, so ingest/assign match them in full even past the remaining debt.
	// `test.fails` keeps the finding visible: it turns red when someone fixes
	// the overpay, which is the cue to move this into the list above.
	test.fails("O-no-overpay: matched total never exceeds the invoice amount", () => {
		expect(violations.get("O-no-overpay")).toBeUndefined();
	});

	test("prints counterexamples", () => {
		for (const [name, seq] of violations) {
			console.log(`[ledger-invariants] ${name}: ${seq.join(" → ")}`);
		}
	});
});
