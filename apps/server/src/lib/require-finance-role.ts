import { canAccessFinance } from "@teacher-os/auth/role";
import type { Context } from "hono";
import type { KernelCtx } from "../app";

type Env = { Variables: { kernelCtx: KernelCtx } };

/**
 * TOS-17 (#451): chặn các vai trò không có quyền tài chính (`ta`,
 * `class_teacher`, hoặc giá trị lạ) truy cập mọi endpoint hóa đơn, phiếu thu,
 * giao dịch ngân hàng và liên kết ngân hàng.
 *
 * Bảo toàn thứ tự gate: chưa đăng nhập (`!ctx`) vẫn trả 401 `unauthorized`
 * trước khi kiểm tra role (403 `finance-forbidden`).
 */
export async function requireFinanceRole(
	c: Context<Env>,
	next: () => Promise<void>,
) {
	const ctx = c.get("kernelCtx");
	if (!ctx) {
		return c.json({ error: "unauthorized" }, 401);
	}
	if (!canAccessFinance(ctx.role)) {
		return c.json({ error: "finance-forbidden" }, 403);
	}
	return next();
}
