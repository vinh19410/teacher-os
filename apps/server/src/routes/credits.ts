import { creditWalletSchema } from "@teacher-os/api/contracts";
import { Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import { ensureWallet, readWallet } from "../lib/credits/wallet";
import { releaseStaleImports } from "../lib/exam-import/release-stale";

export interface CreditRouteDeps {
	getDb(): Db;
}

type Env = { Variables: { kernelCtx: KernelCtx } };

/**
 * Ví Credit (TOS-24 #470) — GET /api/credits/wallet: đọc được với mọi
 * thành viên org (không chỉ teacher), vĩ tạo lười lần đầu xem. `available`
 * = balance − held luôn ≥ 0 vì mọi biến đổi qua wallet service đều có điều
 * kiện `balance - held >= amount` / `held >= amount`.
 */
export function creditRoutes(deps: CreditRouteDeps) {
	const router = new Hono<Env>();

	router.get("/credits/wallet", async (c) => {
		const kernelCtx = c.get("kernelCtx");
		if (!kernelCtx) return c.json({ error: "unauthorized" }, 401);
		const db = deps.getDb();
		// Dọn lười job `processing` treo (plan TOS-27 D3) — xem ví là cơ hội
		// giải tỏa Credit bị giữ bởi job đã chết.
		await releaseStaleImports(db, kernelCtx.orgId);
		await ensureWallet(db, kernelCtx.orgId);
		const wallet = (await readWallet(db, kernelCtx.orgId)) ?? {
			balance: 0,
			held: 0,
		};
		return c.json(
			creditWalletSchema.parse({
				balance: wallet.balance,
				held: wallet.held,
				available: wallet.balance - wallet.held,
			}),
		);
	});

	return router;
}
