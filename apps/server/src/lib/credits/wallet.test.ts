import { createClient } from "@libsql/client";
import {
	QUICK_GRADE_MONTHLY_LIMIT,
	TRIAL_CREDITS,
} from "@teacher-os/api/contracts";
import { monthWindowVietnamMs } from "@teacher-os/api/vietnam-date";
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
	claimQuickGradeSlot,
	ensureWallet,
	InsufficientCreditsError,
	readOrgPlan,
	readWallet,
	releaseCredits,
	reserveCredits,
	revertQuickGradeSlot,
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

describe("credit wallet actionType (TOS-30 #478)", () => {
	test("actionType ai_grading: key prefix ai_grading: + cột action_type đúng", async () => {
		await ensureWallet(db, ORG);
		const reserve = await reserveCredits(db, {
			orgId: ORG,
			actorUserId: "system",
			amount: 1,
			refId: "attempt-1",
			actionType: "ai_grading",
		});
		expect(reserve).toMatchObject({ creditDelta: -1, txStatus: "reserved" });
		await settleCredits(db, {
			orgId: ORG,
			actorUserId: "system",
			amount: 1,
			refId: "attempt-1",
			actionType: "ai_grading",
		});

		const rows = await logs();
		expect(rows.map((r) => r.idempotencyKey)).toEqual([
			"ai_grading:attempt-1:reserve",
			"ai_grading:attempt-1:settle",
		]);
		expect(rows.every((r) => r.actionType === "ai_grading")).toBe(true);
		// exam_import và ai_grading cùng refId là 2 dịch vụ khác nhau —
		// idempotency key KHÔNG chạm nhau (reserve exam_import vẫn thành công).
		await reserveCredits(db, {
			orgId: ORG,
			actorUserId: USER,
			amount: 1,
			refId: "attempt-1",
		});
		const allLogs = await logs();
		expect(allLogs.map((r) => r.idempotencyKey)).toEqual([
			"ai_grading:attempt-1:reserve",
			"ai_grading:attempt-1:settle",
			"exam_import:attempt-1:reserve",
		]);
		expect(allLogs.map((r) => r.txStatus)).toEqual([
			"reserved",
			"settled",
			"reserved",
		]);
	});
});

describe("credit wallet retryCount (TOS-33 #481)", () => {
	const AI_BASE = {
		orgId: ORG,
		actorUserId: "system",
		amount: 1,
		refId: "attempt-r",
		actionType: "ai_grading" as const,
	};

	test("lượt 0 giữ key cũ; retryCount ≥ 1 sinh bộ key r<n> riêng", async () => {
		await ensureWallet(db, ORG);
		await reserveCredits(db, AI_BASE);
		await releaseCredits(db, AI_BASE);
		// Lượt retry 1: bộ key r1 — reserve lại thành công (key cũ không chặn).
		await reserveCredits(db, { ...AI_BASE, retryCount: 1 });
		await settleCredits(db, { ...AI_BASE, retryCount: 1 });

		const rows = await logs();
		expect(rows.map((r) => r.idempotencyKey)).toEqual([
			"ai_grading:attempt-r:reserve",
			"ai_grading:attempt-r:release",
			"ai_grading:attempt-r:r1:reserve",
			"ai_grading:attempt-r:r1:settle",
		]);
		expect(rows.map((r) => r.txStatus)).toEqual([
			"reserved",
			"released",
			"reserved",
			"settled",
		]);
	});

	test("gọi lại cùng n → idempotent trả log cũ; n khác nhau không đè nhau", async () => {
		await ensureWallet(db, ORG);
		const first = await reserveCredits(db, { ...AI_BASE, retryCount: 2 });
		const replay = await reserveCredits(db, { ...AI_BASE, retryCount: 2 });
		expect(replay.id).toBe(first.id);

		await releaseCredits(db, { ...AI_BASE, retryCount: 2 });
		await reserveCredits(db, { ...AI_BASE, retryCount: 3 });

		const rows = await logs();
		expect(rows.map((r) => r.idempotencyKey)).toEqual([
			"ai_grading:attempt-r:r2:reserve",
			"ai_grading:attempt-r:r2:release",
			"ai_grading:attempt-r:r3:reserve",
		]);
		// held: r2 đã release (−1), r3 reserve (+1) → đúng 1 Credit đang giữ.
		const wallet = await readWallet(db, ORG);
		expect(wallet?.held).toBe(1);
	});

	test("retryCount với exam_import bị bỏ qua — key cũ nguyên vẹn", async () => {
		await ensureWallet(db, ORG);
		await reserveCredits(db, {
			...AI_BASE,
			actionType: undefined,
			retryCount: 1,
		});
		const rows = await logs();
		expect(rows[0]?.idempotencyKey).toBe("exam_import:attempt-r:reserve");
	});
});

describe("quick grade writing quota & org plan (TOS-32 #480)", () => {
	test("monthWindowVietnamMs: biên tháng theo Asia/Ho_Chi_Minh (UTC+7)", () => {
		// 2026-10-31T16:59:59.999Z = 2026-10-31 23:59:59.999+07:00 (tháng 10)
		const octEnd = monthWindowVietnamMs(new Date("2026-10-31T16:59:59.999Z"));
		expect(octEnd).toEqual({
			startMs: Date.parse("2026-10-01T00:00:00+07:00"),
			endMs: Date.parse("2026-11-01T00:00:00+07:00"),
		});
		// 2026-10-31T17:00:00.000Z = 2026-11-01 00:00:00.000+07:00 (sang tháng 11)
		const novStart = monthWindowVietnamMs(new Date("2026-10-31T17:00:00.000Z"));
		expect(novStart).toEqual({
			startMs: Date.parse("2026-11-01T00:00:00+07:00"),
			endMs: Date.parse("2026-12-01T00:00:00+07:00"),
		});
	});

	test("readOrgPlan: chưa có ví → none/null; có ví monthly/active → trả đúng", async () => {
		expect(await readOrgPlan(db, ORG)).toEqual({
			planKind: "none",
			planStatus: null,
		});
		await ensureWallet(db, ORG);
		expect(await readOrgPlan(db, ORG)).toEqual({
			planKind: "none",
			planStatus: null,
		});
		await db
			.update(creditWallet)
			.set({ planKind: "monthly", planStatus: "active" })
			.where(eq(creditWallet.orgId, ORG));
		expect(await readOrgPlan(db, ORG)).toEqual({
			planKind: "monthly",
			planStatus: "active",
		});
	});

	test("claimQuickGradeSlot: 29 lượt → lượt 30 true, lượt 31 false; gọi lặp cùng attemptId idempotent", async () => {
		const now = new Date("2026-10-15T08:00:00+07:00");
		for (let i = 1; i <= QUICK_GRADE_MONTHLY_LIMIT - 1; i++) {
			const ok = await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: `att-${i}`,
				now,
			});
			expect(ok).toBe(true);
		}
		// Lượt thứ 30 thành công
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "att-30",
				now,
			}),
		).toBe(true);
		// Gọi lặp cùng attemptId "att-30" → vẫn trả true (idempotent), không tạo dòng thứ 31
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "att-30",
				now,
			}),
		).toBe(true);
		// Lượt thứ 31 bị chặn
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "att-31",
				now,
			}),
		).toBe(false);

		const rows = await logs();
		expect(rows).toHaveLength(QUICK_GRADE_MONTHLY_LIMIT);
		expect(rows[29]).toMatchObject({
			actionType: "quick_grade_writing",
			creditDelta: 0,
			txStatus: "settled",
			refId: "att-30",
			idempotencyKey: "quick_grade_writing:att-30:claim",
		});
	});

	test("2 claim song song khi đã dùng 29/30: đúng 1 true, 1 false", async () => {
		const now = new Date("2026-10-15T08:00:00+07:00");
		for (let i = 1; i <= QUICK_GRADE_MONTHLY_LIMIT - 1; i++) {
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: `race-seed-${i}`,
				now,
			});
		}
		const [first, second] = await Promise.all([
			claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "race-a",
				now,
			}),
			claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "race-b",
				now,
			}),
		]);
		expect([first, second].sort()).toEqual([false, true]);
		expect(await logs()).toHaveLength(QUICK_GRADE_MONTHLY_LIMIT);
	});

	test("sang tháng mới (Asia/Ho_Chi_Minh) hạn mức về lại 30", async () => {
		const oct = new Date("2026-10-31T23:59:00+07:00");
		for (let i = 1; i <= QUICK_GRADE_MONTHLY_LIMIT; i++) {
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: `oct-${i}`,
				now: oct,
			});
		}
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "oct-31",
				now: oct,
			}),
		).toBe(false);

		// Đúng 00:00:00+07:00 ngày 01/11 → tháng mới, claim thành công
		const nov = new Date("2026-11-01T00:00:00+07:00");
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "nov-1",
				now: nov,
			}),
		).toBe(true);
	});

	test("revertQuickGradeSlot: hoàn lại 1 lượt (kể cả khi revert sang đầu tháng mới), gọi 2 lần idempotent", async () => {
		const oct = new Date("2026-10-31T23:59:50+07:00");
		for (let i = 1; i <= QUICK_GRADE_MONTHLY_LIMIT; i++) {
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: `rev-${i}`,
				now: oct,
			});
		}
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "rev-extra",
				now: oct,
			}),
		).toBe(false);

		// Revert lượt 30 (gọi 2 lần vẫn chỉ hoàn đúng 1 lượt; giữ nguyên createdAt cùng tháng với claim)
		expect(
			await revertQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "rev-30",
			}),
		).toBe(true);
		expect(
			await revertQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "rev-30",
			}),
		).toBe(true);
		// Revert một attempt chưa từng claim → false, không tặng thêm lượt
		expect(
			await revertQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "never-claimed",
			}),
		).toBe(false);

		// Giờ còn 29/30 → claim thêm đúng 1 lượt được, lượt kế tiếp bị chặn
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "rev-30-replacement",
				now: oct,
			}),
		).toBe(true);
		expect(
			await claimQuickGradeSlot(db, {
				orgId: ORG,
				attemptId: "rev-31-blocked",
				now: oct,
			}),
		).toBe(false);
	});
});
