---
phase: 1
title: "Lõi Ví Credit + bảng exam_import_job"
status: done
effort: 5h
---

# Phase 1 — Lõi Ví Credit + bảng exam_import_job

## Mục tiêu

Schema + migration cho `credit_wallet`, `credit_usage_log`, `exam_import_job`; service reserve/settle/release nguyên tử, idempotent.

## Files

- Tạo `packages/db/src/schema/credit-wallet.ts` (`creditWallet`, `creditUsageLog`), `packages/db/src/schema/exam-import-job.ts`; export trong `packages/db/src/schema/index.ts`.
- Migration mới qua `pnpm --filter @teacher-os/db db:generate` (số tiếp theo sau `0050_*`).
- Tạo `apps/server/src/lib/credits/wallet.ts` + `wallet.test.ts`.
- `packages/api/src/contracts.ts`: `CREDIT_COSTS = { examImport: 5 } as const`, `TRIAL_CREDITS = 30`, `creditWalletSchema` (`balance`, `held`, `available`).

## Steps

1. Schema theo D1/D4 của plan; `credit_usage_log.idempotency_key` UNIQUE; index `(org_id, created_at)`; `exam_import_job` index `(org_id, content_fingerprint)` và `(org_id, created_at)`.
2. `ensureWallet(db, orgId)`: `INSERT … ON CONFLICT DO NOTHING` với `balance = TRIAL_CREDITS`.
3. `reserveCredits(db, { orgId, actorUserId, amount, refId })`: batch `UPDATE credit_wallet SET held = held + ? WHERE org_id = ? AND balance - held >= ?` + INSERT log `reserved` (`credit_delta = -amount`). Nếu UPDATE ảnh hưởng 0 dòng → ném `InsufficientCreditsError` (mã `E-selfomy-alignment-001`) và không ghi log. Idempotency key trùng → trả kết quả cũ, không giữ thêm.
4. `settleCredits`: `balance = balance - amount, held = held - amount WHERE held >= amount` + log `settled` (`credit_delta = -amount`).
5. `releaseCredits`: `held = held - amount WHERE held >= amount` + log `released` (`credit_delta = +amount`).
6. `assertStaffCap(ctx, amount)` no-op (D3), ghi chú tham chiếu TOS-49.
7. Bước 3–5: dòng log ghi bằng `INSERT … SELECT … WHERE changes() = 1` ngay sau UPDATE trong cùng `db.batch` (D1 batch chạy tuần tự trong 1 transaction) — UPDATE không khớp điều kiện thì không sinh log; sau batch đọc `changes` của UPDATE để ném lỗi.

## Success criteria / Verify

- `pnpm --filter server test -- wallet` pass: reserve đủ/thiếu, settle, release, idempotent 2 lần cùng key, 2 reserve song song khi chỉ đủ 1.
- Migration chạy sạch trên DB local (`pnpm --filter db db:migrate:deploy` hoặc migration test theo mẫu `apps/server/src/*-migration.test.ts`); `pnpm check-types` pass.

## Rủi ro

- D1 batch phải nằm trong cùng `db.batch([...])` để không lệch giữa ví và log.
