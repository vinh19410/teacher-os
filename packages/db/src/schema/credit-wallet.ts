import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Ví Credit của tổ chức (TOS-24 #470, ERD `CreditWallet` — mức tối thiểu
 * US-005; gói tháng/Top-up FEFO thuộc TOS-42). Khả dụng = `balance - held`;
 * KHÔNG cho âm: mọi biến đổi qua service `apps/server/src/lib/credits/
 * wallet.ts` bằng UPDATE có điều kiện trong 1 batch D1, không đụng bảng
 * này trực tiếp từ route.
 */
export const creditWallet = sqliteTable("credit_wallet", {
	// org_id là PK: 1 org 1 ví (ERD CreditWallet).
	orgId: text("org_id").primaryKey(),
	/** Số Credit đã chốt trừ (settled). */
	balance: integer("balance").notNull().default(0),
	/** Số Credit đang tạm giữ (reserved, chưa settled). */
	held: integer("held").notNull().default(0),
	/** Loại gói hiện tại (TOS-32 D1, TOS-42 tiếp quản): "none" | "trial" | "monthly". */
	planKind: text("plan_kind").notNull().default("none"),
	/** Trạng thái gói (TOS-32 D1): "active" | "grace_period" | "expired" (nullable). */
	planStatus: text("plan_status"),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * Sổ cái Credit append-only (ERD `CreditUsageLog`). KHÔNG update/xoá row —
 * every mutation là 1 dòng mới. Quy ước dấu `credit_delta` (kongming
 * red-team #470):
 * - `reserved`: −amount (tiền rút vào held, chưa trừ balance)
 * - `settled`: −amount (chốt trừ khỏi balance + nhả held)
 * - `released`: +amount (hoàn tiền đang giữ)
 * `idempotency_key` UNIQUE chống double-reserve/settle/release khi request
 * chạy lại; `ref_id` trỏ job id gốc.
 */
export const creditUsageLog = sqliteTable(
	"credit_usage_log",
	{
		id: text("id").primaryKey(),
		orgId: text("org_id").notNull(),
		actorUserId: text("actor_user_id").notNull(),
		// "exam_import" — loại dịch vụ tiêu Credit (mở rộng sau bởi TOS-42+).
		actionType: text("action_type").notNull(),
		creditDelta: integer("credit_delta").notNull(),
		// "reserved" | "settled" | "released"
		txStatus: text("tx_status").notNull(),
		refId: text("ref_id").notNull(),
		// "exam_import:<jobId>:<reserve|settle|release>"
		idempotencyKey: text("idempotency_key").notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("credit_usage_log_idempotency_key_idx").on(
			table.idempotencyKey,
		),
		index("credit_usage_log_org_created_idx").on(table.orgId, table.createdAt),
	],
);
