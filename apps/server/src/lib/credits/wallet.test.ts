import { createClient } from "@libsql/client";
import { TRIAL_CREDITS } from "@teacher-os/api/contracts";
import {
	creditUsageLog,
	creditWallet,
} from "@teacher-os/db/schema/credit-wallet";
import * as schema from "@teacher-os/db/schema/index";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Db } from "../../app";
import {
	assertStaffCap,
	ensureWallet,
	InsufficientCreditsError,
	readWallet,
	releaseCredits,
	reserveCredits,
	settleCredits,
} from "./wallet";

// SQLite THẬT in-memory + migration thật (có 0051 credit_wallet) — chứng
// minh batch UPDATE+INSERT...SELECT WHERE changes()=1 nguyên tử trên SQL
// thật, không fake db (precedent boot.ts apps/e2e).
const MIGRATIONS_DIR = new URL(
	"../../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const ORG = "org-w1";
const USER = "u-w1";

let db: Db;

beforeAll(async () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	db = libsql as unknown as Db;
});

beforeEach(async () => {
	await db.delete(creditUsageLog);
	await db.delete(creditWallet);
});

async function logs(orgId: string = ORG) {
	return (
		db
			.select()
			.from(creditUsageLog)
			.where(eq(creditUsageLog.orgId, orgId))
			// rowid = thứ tự chèn (createdAt cùng ms với 2 log liền nhau).
			.orderBy(creditUsageLog.createdAt, sql`rowid`)
	);
}

/** Đặt số dư trực tiếp cho kịch bản thiếu Credit (test-only). */
async function forceBalance(balance: number) {
	await db
		.update(creditWallet)
		.set({ balance })
		.where(eq(creditWallet.orgId, ORG));
}

describe("credit wallet (TOS-24 #470)", () => {
	test("reserve đủ: held tăng, log reserved −amount, balance nguyên", async () => {
		await ensureWallet(db, ORG);
		const result = await reserveCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-r1",
		});
		expect(result).toMatchObject({
			creditDelta: -5,
			txStatus: "reserved",
		});
		const wallet = await readWallet(db, ORG);
		expect(wallet).toEqual({ balance: TRIAL_CREDITS, held: 5 });
		const rows = await logs();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.idempotencyKey).toBe("exam_import:job-r1:reserve");
		expect(rows[0]?.actorUserId).toBe(USER);
		expect(rows[0]?.actionType).toBe("exam_import");
		expect(rows[0]?.refId).toBe("job-r1");
	});

	test("reserve thiếu Credit: ném InsufficientCreditsError + KHÔNG sinh log", async () => {
		await ensureWallet(db, ORG);
		await forceBalance(4);
		await expect(
			reserveCredits(db, {
				orgId: ORG,
				actorUserId: USER,
				amount: 5,
				refId: "job-r2",
			}),
		).rejects.toMatchObject({
			name: "InsufficientCreditsError",
			code: "E-selfomy-alignment-001",
		});
		const wallet = await readWallet(db, ORG);
		expect(wallet).toEqual({ balance: 4, held: 0 });
		expect(await logs()).toHaveLength(0);
	});

	test("settle sau reserve: balance −5, held nhả hết, đúng 1 reserved + 1 settled", async () => {
		await ensureWallet(db, ORG);
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-s1",
		});
		const settled = await settleCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-s1",
		});
		expect(settled).toMatchObject({ creditDelta: -5, txStatus: "settled" });
		const wallet = await readWallet(db, ORG);
		expect(wallet).toEqual({ balance: TRIAL_CREDITS - 5, held: 0 });
		const rows = await logs();
		expect(rows.map((r) => r.txStatus)).toEqual(["reserved", "settled"]);
		expect(rows.map((r) => r.creditDelta)).toEqual([-5, -5]);
	});

	test("release sau reserve: balance nguyên, held nhả hết, log released +amount", async () => {
		await ensureWallet(db, ORG);
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-x1",
		});
		const released = await releaseCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-x1",
		});
		expect(released).toMatchObject({ creditDelta: 5, txStatus: "released" });
		const wallet = await readWallet(db, ORG);
		expect(wallet).toEqual({ balance: TRIAL_CREDITS, held: 0 });
		const rows = await logs();
		expect(rows.map((r) => r.txStatus)).toEqual(["reserved", "released"]);
	});

	test("idempotent: gọi 2 lần cùng refId trả kết quả cũ, không giữ thêm", async () => {
		await ensureWallet(db, ORG);
		const first = await reserveCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-dup",
		});
		const second = await reserveCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-dup",
		});
		expect(second).toEqual(first);
		const wallet = await readWallet(db, ORG);
		expect(wallet).toEqual({ balance: TRIAL_CREDITS, held: 5 });
		expect(await logs()).toHaveLength(1);
	});

	test("2 reserve song song khi ví chỉ đủ 1 lần: đúng 1 thành công", async () => {
		await ensureWallet(db, ORG);
		await forceBalance(5);
		const results = await Promise.allSettled([
			reserveCredits(db, {
				orgId: ORG,
				actorUserId: USER,
				amount: 5,
				refId: "job-p1",
			}),
			reserveCredits(db, {
				orgId: ORG,
				actorUserId: USER,
				amount: 5,
				refId: "job-p2",
			}),
		]);
		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter(
			(r) =>
				r.status === "rejected" && r.reason instanceof InsufficientCreditsError,
		);
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		const wallet = await readWallet(db, ORG);
		expect(wallet).toEqual({ balance: 5, held: 5 });
		const rows = await logs();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.txStatus).toBe("reserved");
	});

	test("lazy-create 2 Promise.all: chỉ 1 ví, balance TRIAL_CREDITS", async () => {
		await Promise.all([ensureWallet(db, ORG), ensureWallet(db, ORG)]);
		const rows = await db
			.select()
			.from(creditWallet)
			.where(eq(creditWallet.orgId, ORG));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.balance).toBe(TRIAL_CREDITS);
		expect(rows[0]?.held).toBe(0);
	});

	test("double-release: lần 2 no-op trả kết quả cũ, không log thêm", async () => {
		await ensureWallet(db, ORG);
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-dr",
		});
		const first = await releaseCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-dr",
		});
		const second = await releaseCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 5,
			refId: "job-dr",
		});
		expect(second).toEqual(first);
		const wallet = await readWallet(db, ORG);
		expect(wallet).toEqual({ balance: TRIAL_CREDITS, held: 0 });
		const rows = await logs();
		expect(rows.filter((r) => r.txStatus === "released")).toHaveLength(1);
	});

	test("assertStaffCap hiện là no-op (chờ TOS-49)", () => {
		expect(assertStaffCap({ orgId: ORG, userId: USER }, 5)).toBeUndefined();
	});
});
