# Máy trạng thái — feature credits

> Sổ cái append-only nên "trạng thái" của một giao dịch là trạng thái của **nhóm khóa** `<dịch vụ>:<ref>[:r<n>]`; row cũ không bao giờ đổi, bước mới là row mới (🟡 mô tả theo comment schema + hành vi service). Trạng thái job/draft là trạng thái cột thật.

## 1. Giao dịch ví (một lượt tiêu Credit, theo khóa idempotency)

```mermaid
stateDiagram-v2
    [*] --> ChuaCo: chua co log theo khoa
    ChuaCo --> Reserved: reserve thanh cong (log -amount, held +amount)
    ChuaCo --> ChuaCo: reserve thua (khong log, nem E-001)
    Reserved --> Settled: settle (log -amount, balance -amount, held -amount)
    Reserved --> Released: release (log +amount, held -amount)
    Reserved --> Reserved: goi lai cung khoa (tra log cu, khong doi)
    Settled --> [*]: giao dich ket thuc (credit da tru)
    Released --> [*]: giao dich ket thuc (credit hoan ve)
```

- Bằng chứng: guard + cột set theo op — apps/server/src/lib/credits/wallet.ts:271-284; log chỉ sinh khi UPDATE khớp — apps/server/src/lib/credits/wallet.ts:289-302; replay trả log cũ — apps/server/src/lib/credits/wallet.ts:303-309; UNIQUE khóa — packages/db/src/schema/credit-wallet.ts:65-69.

## 2. Lượt Chấm nhanh Writing (delta 0, theo attemptId)

```mermaid
stateDiagram-v2
    [*] --> Claimed: INSERT...SELECT count<30 (log "settled" delta 0)
    Claimed --> Claimed: goi lai cung attemptId (idempotent, true)
    Claimed --> Reverted: AI loi/treo/sweep (log bu "reverted", copy created_at cua claim)
    Reverted --> Claimed: attempt khac claim lai slot du tra
    Claimed --> Claimed: qua giao thua thang (cua so thang moi: quota hoi 30)
```

- Bằng chứng: apps/server/src/lib/credits/wallet.ts:148-233; test biên tháng + revert: apps/server/src/lib/credits/wallet.test.ts:446-497, 499-552.

## 3. Job nhập đề (import_status) — liên kết Credit

```mermaid
stateDiagram-v2
    [*] --> DaXoa: reserve thua - xoa job + file R2 (402)
    [*] --> processing: INSERT sau khi reserve OK (heldCredits = 5)
    processing --> completed: settle OK + mark (credit da tru 5)
    processing --> failed_refunded: extract loi / stale sweep >150s (release 5)
    processing --> completed: crash-sau-settle duoc sweep chot (khong hoan)
    failed_refunded --> processing: retry tao job moi + reserve lai
```

- Bằng chứng: vòng đời ghi trong schema — packages/db/src/schema/exam-import-job.ts:6-16; reserve thua xóa job — apps/server/src/routes/exam-imports.ts:305-321; settle trước mark — apps/server/src/lib/exam-import/run-import.ts:186-216; sweep — apps/server/src/lib/exam-import/release-stale.ts:35-73; retry — apps/server/src/routes/exam-imports.ts:500-570.

## 4. Draft chấm AI (status) — liên kết Credit

```mermaid
stateDiagram-v2
    [*] --> ai_processing: tao draft + reserve creditCost (1 Writing / 2 Speaking)
    ai_processing --> ai_drafted: AI thanh cong + CAS thang (settle)
    ai_processing --> manual_pending: AI loi (release), thieu Credit (khong reserve), CAS thua (release)
    ai_processing --> manual_pending: stale sweep >60s (CAS TIMEOUT + release)
    manual_pending --> ai_processing: ai-retry hop le (releaseUnsettledOccasions truoc, reserve bo r(n) sau)
    ai_drafted --> teacher_reviewing: giao vien luu ban nhap (khong dong vi)
    teacher_reviewing --> published: chot tra bai (khong dong vi)
    manual_pending --> published: cham tay roi chot (khong dong vi)
```

- Bằng chứng: máy trạng thái ghi trong schema — packages/db/src/schema/ai-grading-draft.ts:16-22; CAS trước ví sau — apps/server/src/lib/ai-grading/run-grading.ts:528-551; nhánh thiếu Credit — apps/server/src/lib/ai-grading/run-grading.ts:400-440; sweep 3 nhóm — apps/server/src/lib/ai-grading/release-stale.ts:47-172; ai-retry — apps/server/src/routes/grading.ts:1279-1327.
- Ghi chú 🟡: các nhánh "không đụng ví" của teacher_reviewing/published là suy ra từ việc publish/PATCH không import hàm ví + comment sweep (apps/server/src/lib/ai-grading/release-stale.ts:26-28).

## 5. Gói tổ chức (plan_kind × plan_status)

```mermaid
stateDiagram-v2
    [*] --> none: default khi tao vi
    none --> trial: 🟡 khong co writer trong repo (OQ-1)
    none --> monthly: 🟡 khong co writer trong repo (OQ-1)
    trial --> active: 🟡 khong co writer
    monthly --> active: 🟡 khong co writer
    active --> grace_period: 🟡 khong co writer
    grace_period --> expired: 🟡 khong co writer
    expired --> active: 🟡 gia han - khong co writer
```

- Bằng chứng tồn tại trạng thái: cột + default — packages/db/src/schema/credit-wallet.ts:24-27, migration 0055; reader chuẩn hóa — apps/server/src/lib/credits/wallet.ts:108-146; consumer duy nhất — apps/server/src/lib/ai-grading/run-grading.ts:405-414. Toàn bộ chuyển trạng thái là 🟡 Inferred (GAP-1/OQ-1).
