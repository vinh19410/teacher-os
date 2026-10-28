import {
	QUICK_GRADE_MONTHLY_LIMIT,
	TRIAL_CREDITS,
} from "@teacher-os/api/contracts";
import { monthWindowVietnamMs } from "@teacher-os/api/vietnam-date";
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

/** Loại dịch vụ tiêu Credit — quyết prefix idempotency key lẫn cột
 * `action_type` của sổ cái (TOS-30 mở rộng từ `exam_import`). */
export type CreditActionType = "exam_import" | "ai_grading";

/** Đầu vào chung của reserve/settle/release — `refId` là job id gốc. */
export interface CreditMutationInput {
	orgId: string;
	actorUserId: string;
	amount: number;
	refId: string;
	/** Mặc định `exam_import` (callers cũ); chấm nháp AI truyền
	 * `ai_grading` để sổ cái phân biệt dịch vụ (TOS-42 báo cáo theo loại). */
	actionType?: CreditActionType;
	/** TOS-33 D3: lượt chấm lại AI (0/bỏ trống = lượt gốc). `ai_grading` với
	 * `retryCount ≥ 1` dùng bộ key riêng `…:r<n>:<op>` — mỗi lượt một bộ
	 * reserve/settle/release; `refId` giữ `attemptId` để sweep/sổ cái nhóm
	 * đúng theo bài. */
	retryCount?: number;
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

/** Loại gói của tổ chức (TOS-32 D1, TOS-42 tiếp quản). */
export type OrgPlanKind = "none" | "trial" | "monthly";
/** Trạng thái gói của tổ chức (TOS-32 D1). */
export type OrgPlanStatus = "active" | "grace_period" | "expired";

export interface OrgPlanState {
	planKind: OrgPlanKind;
	planStatus: OrgPlanStatus | null;
}

type WalletOp = "reserve" | "settle" | "release";

/** Key chống chạy đúp — UNIQUE index `credit_usage_log_idempotency_key_idx`.
 * Prefix theo `actionType`: `exam_import:<refId>:<op>` (cũ) /
 * `ai_grading:<attemptId>:<op>` (TOS-30 lượt gốc) /
 * `ai_grading:<attemptId>:r<n>:<op>` (TOS-33 lượt chấm lại n ≥ 1). */
function idempotencyKey(input: CreditMutationInput, op: WalletOp): string {
	const retrySuffix =
		input.actionType === "ai_grading" &&
		typeof input.retryCount === "number" &&
		input.retryCount >= 1
			? `:r${input.retryCount}`
			: "";
	return `${input.actionType ?? "exam_import"}:${input.refId}${retrySuffix}:${op}`;
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

const VALID_PLAN_KINDS: readonly OrgPlanKind[] = ["none", "trial", "monthly"];
const VALID_PLAN_STATUSES: readonly OrgPlanStatus[] = [
	"active",
	"grace_period",
	"expired",
];

function isOrgPlanKind(value: string): value is OrgPlanKind {
	return (VALID_PLAN_KINDS as readonly string[]).includes(value);
}

function isOrgPlanStatus(value: string | null): value is OrgPlanStatus {
	return (
		value !== null && (VALID_PLAN_STATUSES as readonly string[]).includes(value)
	);
}

/**
 * Đọc trạng thái gói hiện tại của tổ chức từ `credit_wallet` (TOS-32 D1).
 * Khi org chưa có dòng ví hoặc giá trị ngoài tập hợp lệ → `{ planKind: "none", planStatus: null }`.
 */
export async function readOrgPlan(
	db: Db,
	orgId: string,
): Promise<OrgPlanState> {
	const [row] = await db
		.select({
			planKind: creditWallet.planKind,
			planStatus: creditWallet.planStatus,
		})
		.from(creditWallet)
		.where(eq(creditWallet.orgId, orgId))
		.limit(1);
	if (!row) return { planKind: "none", planStatus: null };
	return {
		planKind: isOrgPlanKind(row.planKind) ? row.planKind : "none",
		planStatus: isOrgPlanStatus(row.planStatus) ? row.planStatus : null,
	};
}

function quickGradeClaimKey(attemptId: string): string {
	return `quick_grade_writing:${attemptId}:claim`;
}

function quickGradeRevertKey(attemptId: string): string {
	return `quick_grade_writing:${attemptId}:revert`;
}

/**
 * Giành 1 lượt Chấm nhanh Writing (0 Credit) trong tháng dương lịch theo giờ
 * Việt Nam (`Asia/Ho_Chi_Minh`) (TOS-32 D2, tối đa 30 lượt/tháng).
 * Kiểm hạn mức và ghi sổ cái trong MỘT câu `INSERT ... SELECT ... WHERE count < 30`
 * nguyên tử để 2 bài nộp đồng thời không bao giờ vượt 30.
 * Idempotent theo `attemptId`: gọi lặp cùng `attemptId` đã claim trả `true` mà không đếm thêm.
 */
export async function claimQuickGradeSlot(
	db: Db,
	input: {
		orgId: string;
		attemptId: string;
		actorUserId?: string;
		now?: Date;
	},
): Promise<boolean> {
	const key = quickGradeClaimKey(input.attemptId);
	const existing = await findLogByKey(db, key);
	if (existing) return true;

	const now = input.now ?? new Date();
	const { startMs, endMs } = monthWindowVietnamMs(now);
	const actorUserId = input.actorUserId ?? "system";
	const createdMs = now.getTime();

	try {
		await db
			.insert(creditUsageLog)
			.select(
				sql`SELECT ${crypto.randomUUID()}, ${input.orgId}, ${actorUserId}, ${"quick_grade_writing"}, ${0}, ${"settled"}, ${input.attemptId}, ${key}, ${createdMs} WHERE MAX((SELECT COALESCE(SUM(CASE WHEN ${creditUsageLog.txStatus} = 'settled' THEN 1 WHEN ${creditUsageLog.txStatus} = 'reverted' THEN -1 ELSE 0 END), 0) FROM ${creditUsageLog} WHERE ${creditUsageLog.orgId} = ${input.orgId} AND ${creditUsageLog.actionType} = 'quick_grade_writing' AND ${creditUsageLog.createdAt} >= ${startMs} AND ${creditUsageLog.createdAt} < ${endMs}), 0) < ${QUICK_GRADE_MONTHLY_LIMIT}`,
			);
	} catch (error) {
		const previous = await findLogByKey(db, key);
		if (previous) return true;
		throw error;
	}

	const inserted = await findLogByKey(db, key);
	return inserted !== null;
}

/**
 * Hoàn lại 1 lượt Chấm nhanh Writing khi AI lỗi/quá hạn hoặc isolate chết
 * trước khi chấm xong (TOS-32 D3). Sổ cái append-only nên ghi 1 dòng bù
 * `tx_status = "reverted"` (lấy `created_at` từ chính dòng `claim` gốc để cặp
 * `settled`/`reverted` luôn triệt tiêu trong cùng tháng dương lịch kể cả khi
 * revert diễn ra qua giao thừa đầu tháng). Idempotent theo `attemptId`.
 */
export async function revertQuickGradeSlot(
	db: Db,
	input: {
		orgId: string;
		attemptId: string;
		actorUserId?: string;
	},
): Promise<boolean> {
	const claimKey = quickGradeClaimKey(input.attemptId);
	const revertKey = quickGradeRevertKey(input.attemptId);
	const existingRevert = await findLogByKey(db, revertKey);
	if (existingRevert) return true;

	const actorUserId = input.actorUserId ?? "system";

	try {
		await db
			.insert(creditUsageLog)
			.select(
				sql`SELECT ${crypto.randomUUID()}, ${input.orgId}, ${actorUserId}, ${"quick_grade_writing"}, ${0}, ${"reverted"}, ${input.attemptId}, ${revertKey}, ${creditUsageLog.createdAt} FROM ${creditUsageLog} WHERE ${creditUsageLog.idempotencyKey} = ${claimKey} AND ${creditUsageLog.orgId} = ${input.orgId} AND NOT EXISTS (SELECT 1 FROM ${creditUsageLog} rev WHERE rev.idempotency_key = ${revertKey})`,
			);
	} catch (error) {
		const previous = await findLogByKey(db, revertKey);
		if (previous) return true;
		throw error;
	}

	const inserted = await findLogByKey(db, revertKey);
	return inserted !== null;
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
	const key = idempotencyKey(input, op);
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
	// action_type theo dịch vụ (exam_import cũ / ai_grading TOS-30).
	const logInsert = db
		.insert(creditUsageLog)
		.select(
			sql`SELECT ${crypto.randomUUID()}, ${input.orgId}, ${input.actorUserId}, ${input.actionType ?? "exam_import"}, ${creditDelta}, ${txStatus}, ${input.refId}, ${key}, ${Date.now()} WHERE (SELECT changes() = 1)`,
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
