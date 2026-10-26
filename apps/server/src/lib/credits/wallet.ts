import { TRIAL_CREDITS } from "@teacher-os/api/contracts";
import {
	creditUsageLog,
	creditWallet,
} from "@teacher-os/db/schema/credit-wallet";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../app";

/** Lỗi vĩ không đủ Credit — route ánh xạ thành 402
 * `E-selfomy-alignment-001` (EXAM_IMPORT_ERROR_CODES.INSUFFICIENT_CREDITS). */
export class InsufficientCreditsError extends Error {
	readonly code = "E-selfomy-alignment-001";

	constructor() {
		super("insufficient credits");
		this.name = "InsufficientCreditsError";
	}
}

/** Đầu vào chung của reserve/settle/release — `refId` là job id gốc. */
export interface CreditMutationInput {
	orgId: string;
	actorUserId: string;
	amount: number;
	refId: string;
}

/** Kết quả mutation — dòng log mới (hoặc log cũ khi gọi lại cùng key). */
export interface CreditMutationResult {
	id: string;
	creditDelta: number;
	txStatus: string;
}

/** Số dư đọc trực tiếp từ bảng `credit_wallet` (null khi org chưa có vĩ). */
export interface WalletBalance {
	balance: number;
	held: number;
}

type WalletOp = "reserve" | "settle" | "release";

/** Key chống chạy đúp — UNIQUE index `credit_usage_log_idempotency_key_idx`. */
function idempotencyKey(refId: string, op: WalletOp): string {
	return `exam_import:${refId}:${op}`;
}

/**
 * Tạo lười vĩ Credit cho org lần đầu tiêu Credit: 30 Credit Dùng thử
 * (TRIAL_CREDITS). `ON CONFLICT DO NOTHING` để 2 request song song cùng
 * bootstrap org không ném lỗi UNIQUE (chỉ 1 row chui vào).
 */
export async function ensureWallet(db: Db, orgId: string): Promise<void> {
	await db
		.insert(creditWallet)
		.values({ orgId, balance: TRIAL_CREDITS })
		.onConflictDoNothing();
}

/** Đọc số dư hiện tại (route dùng trả 402 kèm `balance`). */
export async function readWallet(
	db: Db,
	orgId: string,
): Promise<WalletBalance | null> {
	const [row] = await db
		.select({ balance: creditWallet.balance, held: creditWallet.held })
		.from(creditWallet)
		.where(eq(creditWallet.orgId, orgId))
		.limit(1);
	return row ?? null;
}

async function findLogByKey(
	db: Db,
	key: string,
): Promise<CreditMutationResult | null> {
	const [row] = await db
		.select({
			id: creditUsageLog.id,
			creditDelta: creditUsageLog.creditDelta,
			txStatus: creditUsageLog.txStatus,
		})
		.from(creditUsageLog)
		.where(eq(creditUsageLog.idempotencyKey, key))
		.limit(1);
	return row ?? null;
}

/**
 * Cặp lệnh nguyên tử của một biến đổi vĩ: UPDATE có điều kiện + dòng log chỉ chui
 * vào khi UPDATE khớp (`WHERE (SELECT changes() = 1)` — `changes()` đọc kết
 * quả statement NGAY TRƯỚC trong cùng batch; batch D1/libsql chạy tuần tự
 * trong 1 transaction nên vĩ và log không bao giờ lệch nhau). UPDATE trượt
 * điều kiện → không sinh log → sau batch caller ném
 * `InsufficientCreditsError`. INSERT trùng key UNIQUE → cả batch rollback
 * (vĩ không đổi) → trả kết quả cũ theo key, không giữ thêm.
 *
 * Quy ước dấu `credit_delta` (comment schema `credit-wallet.ts`):
 * reserve −amount, settle −amount, release +amount.
 */
async function mutateWallet(
	db: Db,
	input: CreditMutationInput,
	op: WalletOp,
): Promise<CreditMutationResult> {
	const key = idempotencyKey(input.refId, op);
	const txStatus = op === "release" ? "released" : `${op}d`;

	const guardHeld =
		op === "reserve"
			? sql`${creditWallet.balance} - ${creditWallet.held} >= ${input.amount}`
			: sql`${creditWallet.held} >= ${input.amount}`;
	const setColumns =
		op === "reserve"
			? { held: sql`${creditWallet.held} + ${input.amount}` }
			: op === "settle"
				? {
						balance: sql`${creditWallet.balance} - ${input.amount}`,
						held: sql`${creditWallet.held} - ${input.amount}`,
					}
				: { held: sql`${creditWallet.held} - ${input.amount}` };
	const creditDelta = op === "release" ? input.amount : -input.amount;

	// Cột SELECT phải đủ và đúng thứ tự toàn bộ cột bảng (INSERT ... SELECT
	// của drizzle liệt kê mọi cột không-disable) — kể cả created_at.
	const logInsert = db
		.insert(creditUsageLog)
		.select(
			sql`SELECT ${crypto.randomUUID()}, ${input.orgId}, ${input.actorUserId}, 'exam_import', ${creditDelta}, ${txStatus}, ${input.refId}, ${key}, ${Date.now()} WHERE (SELECT changes() = 1)`,
		);

	try {
		await db.batch([
			db
				.update(creditWallet)
				.set(setColumns)
				.where(and(eq(creditWallet.orgId, input.orgId), guardHeld)),
			logInsert,
		]);
	} catch (error) {
		// UNIQUE idempotency key → batch rollback nguyên phần (vĩ nguyên vẹn):
		// request chạy lại với cùng refId trả đúng kết quả cũ.
		const previous = await findLogByKey(db, key);
		if (previous) return previous;
		throw error;
	}

	const row = await findLogByKey(db, key);
	if (!row) {
		// Không có log = UPDATE trượt điều kiện (thiếu Credit / held không đủ).
		throw new InsufficientCreditsError();
	}
	return row;
}

/**
 * Giữ `amount` Credit vào `held` (chưa trừ balance) cho một lượt import đề.
 * Idempotent theo `refId`; thiếu Credit → `InsufficientCreditsError`, không
 * để lại dòng log.
 */
export function reserveCredits(
	db: Db,
	input: CreditMutationInput,
): Promise<CreditMutationResult> {
	return mutateWallet(db, input, "reserve");
}

/** Chốt trừ sau extract thành công: balance − amount, nhả held. */
export function settleCredits(
	db: Db,
	input: CreditMutationInput,
): Promise<CreditMutationResult> {
	return mutateWallet(db, input, "settle");
}

/** Hoàn Credit đang giữ khi extract lỗi (balance nguyên, nhả held). */
export function releaseCredits(
	db: Db,
	input: CreditMutationInput,
): Promise<CreditMutationResult> {
	return mutateWallet(db, input, "release");
}

/**
 * Trần Credit cá nhân (US-010) — no-op ở plan TOS-24; cài đặt thật thuộc
 * TOS-49 (giới hạn theo vai/swap gói). Hook giữ chỗ để route không phải
 * sửa lại luồng khi bật.
 */
export function assertStaffCap(
	_ctx: { orgId: string; userId: string },
	_amount: number,
): void {}
