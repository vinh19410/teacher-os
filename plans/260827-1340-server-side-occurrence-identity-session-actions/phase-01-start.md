---
phase: 1
title: "Skeleton twin + schema + backfill + generator"
status: completed
priority: P1
effort: "2d"
dependencies: []
---

# Phase 1: Skeleton twin + schema + backfill + generator

## Overview

Nền tảng deploy-unit duy nhất của cả plan (kongming K1): skeleton pure-function `packages/api` (twin 100% thuật toán `buildClassSessions` — Client), migration SQL thêm cột `lesson.date`, backfill idempotent script gán date theo thứ tự `(created_at ASC, rowid ASC)` với quyết-NULL **theo class**, và rewrite generator ghi date cho mọi enrollment mới. Sau phase này dữ liệu mới & cũ cùng nói một ngôn ngữ identity; client chưa đụng nên UX không đổi.

## Requirements

- Functional:
  - `packages/api` export thuần: `parseStoredSchedule`(port từ kernel.ts:48-61 gồm dedup+sort days), `parseStartDateStrict`(roundtrip-guard ngày lịch-không-tồn-tại như web :74-75), `skeletonOf(schedule, startISO, total)` → map `weekday→[dateISO k-th]`, và `conforms()`. Neo UTC-midnight y hệt comment class-sessions.ts:27-28.
  - **`conforms()` kiểm tra ĐỦ 5 điều kiện** trước khi gán date cho class (red-team round-2 N1, kongming GO): (1) schedule-parse OK ∧ (2) startDate OK ∧ (3) walk đủ `total` (cận `total*7+14`) ∧ (4) **count-per-(sid,weekday) set-EQUALITY với công thức generator `floor(total/len)+idx_d<rem_d` trên TOÀN BỘ key-set — weekday NGOÀI lịch xuất hiện trong rows cũng fail, không chỉ thiếu/thừa đếm weekday-trong-lịch** ∧ (5) **MỌI row giữ nguyên slot guard legacy: `time === parsed.start` và `day ∈ days(dedup+sort)` như divergence guard web hôm nay (class-sessions.ts:104-112)** — lệch bất kỳ ⇒ nguyên class NULL. Điều kiện (5) bắt đúng lớp từng sửa GIỜ một buổi qua `/lessons/:id/edit` (đang hiển thị frozen legacy vì guard thời gian) phải TIẾP TỤC legacy sau backfill — count-vector thuần không thấy lệch time (red-team round-2 N1b).
  - Migration theo **drizzle-kit generate flow** (custom SQL statements `--> statement-breakpoint`; `_journal.json` do kit quản — KHÔNG tạo file tay): `ALTER TABLE lesson ADD COLUMN date TEXT;` + CREATE INDEX thường `lesson_class_date_idx ON lesson(class_id, date)` (K5).
  - Backfill = **offline SQL-generator script** (không thêm dep mới, không đụng D1 trực tiếp): đầu vào là dump JSON từ `wrangler d1 execute --remote --json "SELECT ..."`; lõi thuần `(dumpRows, skeletonsById) => sqlUpdateLines[]` idempotent (`WHERE date IS NULL`); operator áp output bằng `wrangler d1 execute --remote --file=out.sql`. Lõi được unit-test trong apps/server.
  - Generator rewrite (kernel.ts:86-109): giữ cycle raw như cũ nhưng attach `date = skeleton[weekday][ordinal++]`; insert thêm cột `date` trong batch POST /students (:381-416). **Dependency bắt buộc (kongming GO-D5c): generator mới cần `startISO` đầu vào nhưng `findClass` (kernel.ts:157-168) hiện chỉ select `{id, schedule, sessionsTotal, syllabusId}` — BỔ SUNG `startDate` vào projection này cùng change-set; bỏ qua là blocker dính giữa cook.**
  - Wire contract K6: `KernelLessonRow.date: string | null` (contracts.ts:341) + projection snapshot.ts trả field này.
- Non-functional:
  - ⚠️ **parity tests đặt tại `apps/server/src/skeleton-parity.test.ts` import `@teacher-os/api/skeleton`** — packages/api KHÔNG có vitest runner/script test (root `turbo run test` bỏ qua) nên test đặt trong packages/api sẽ KHÔNG BAO GIỜ chạy dưới gates (red-team Critical).
  - Fixture "duplicate-days entries" đánh dấu regression-guard cho DB-tay (prod unreachable: server normalize `[...new Set(days)].sort` lúc tạo class kernel.ts:464-467).

## Architecture

```
packages/api/src/skeleton.ts   ← THUẦN, không import db/server/web
   parseStoredSchedule + parseStartDateStrict + skeletonOf + conforms()
        ▲ consumed by                    ▲ consumed by
apps/server                         apps/server/src/backfill-sql-generator.ts
 (generator :82-105,                 (dump JSON wrangler → UPDATE .sql idempotent;
  endpoints P2)                      áp bằng wrangler d1 execute --remote --file)
migration (drizzle-kit generate: ALTER + index thường, journal auto-managed)
runbook A/B/C (N3): PR-A = migrate+generator+P2..P4 code → deploy (Alchemy
                  auto-áp) → backfill SQL → verify PASS (delta re-dump loop)
                  → PR-C riêng = unique index 0011 (heal-dup checklist trước apply)
```

Quyết-NULL theo class (K2): `conforms()` kiểm tra cả 5 điều kiện trên TRƯỚC khi gán bất kỳ row nào; một điều kiện hỏng ⇒ class đó toàn NULL ⇒ legacy fallback như hôm nay (behavior-preserving). **Cấu trúc này đảm bảo không có class lai NULL/non-NULL trong steady-state** (red-team round-2 N10: cửa sổ vận hành dump→apply và rollback worker cũ CÓ THỂ sinh tạm row NULL trong class đã dated — được coi là mixed input-repairable, runbook P5 có delta re-dump loop + quy trình hồi phục; KHÔNG phải trạng thái thiết kế).

Surplus quirk: per-weekday count `count_d = floor(total/len(days)) + (idx_d < total % len ? 1 : 0)` trên mảng days ĐÃ dedup+sort — không bao giờ chọn theo "ngày lịch đầu tiên" (comment class-sessions.ts:115-118 đã cảnh báo nguyên nhân).

## Related Code Files

- Create: `packages/api/src/skeleton.ts` (impl thuần), `apps/server/src/skeleton-parity.test.ts` (parity runner — chạy dưới gates server)
- Create: migration qua drizzle-kit generate (custom SQL 0010: ALTER + index thường, journal auto-managed)
- Create: `apps/server/src/backfill-sql-generator.ts` + CLI entry (`scripts` entry package apps/server) + `apps/server/src/lesson-date-backfill-migration.test.ts`
- Modify: `packages/api/src/contracts.ts` (`KernelLessonRow.date`), `apps/server/src/routes/kernel.ts` (generator), `apps/server/src/routes/snapshot.ts` (projection), `packages/db/src/schema/lesson.ts` (column + docblock mới K8)
- Modify: `docs/code-standards.md` (carve-out "derived-until-user-mutable" — K8) + `docs/system-architecture.md` ownership-table ghi nhận skeleton home tại packages/api (red-team Low #8)

## Implementation Steps

1. Tests-first `apps/server/src/skeleton-parity.test.ts`: port case-list (xem Success Criteria) từ fixtures web; red (import `@teacher-os/api/skeleton` chưa tồn tại).
2. Implement `skeleton.ts` thuần trong packages/api; green.
3. Migration SQL 0010 (drizzle-kit generate) + schema lesson.ts: cột `date` text nullable + docblock giải thích vì sao date là persisted fact (mutable qua moveDate P2) + ràng buộc "class fields bất biến".
4. Snapshot projection + contracts: additive `date: string | null` end-to-end wire (server trả ngay, web chưa consume — gates xanh chứng minh additive-safe).
5. Backfill SQL-generator lõi + data-migration test adversarial (fixtures tie-created_at, divergent rows, day-within-schedule-lệch-count ⇒ conforms phải NULL, time-divergence (1 row dời giờ 19:00→20:00 cùng giữ weekday) ⇒ conforms phải NULL — N1b, multi-sid lệch count mỗi weekday, cap-trip class); assert idempotency double-run; assert NOT tạo mixed class; output SQL chứa chỉ UPDATE … WHERE date IS NULL AND id IN (…).
6. Generator rewrite attach-date + unit test trên app-server test harness hiện có (gồm sửa findClass projection thêm `startDate` theo Requirements).
7. Gates: `pnpm check && pnpm test && pnpm check-types`.

## Success Criteria

- [x] Parity pin chạy dưới `pnpm test` (workspace server): với MỌI fixture — grouped-by-date output ≡ heuristic legacy cho status/students/attendance; odd-total 25/2-ngày & 26/3-ngày khớp quirk; duplicate-days (đánh dấu defensive-guard); startDate-off-day & startDate-weekday-sau-array-first-day; tie createdAt ≥2 rows cùng ms → deterministic bằng rowid.
- [x] `conforms()` bắt được fixture day-within-schedule-shift (count-vector set-equality fail) VÀ fixture time-divergence (slot-guard legacy mirror fail) → cả hai class NULL.
- [x] Backfill output: conform-class 100% rows dated, non-conform-class 100% NULL (không mixed), rerun no-op trên output lần trước.
- [x] New enrollment post-deploy mang đầy date (app-server test).
- [x] Wire response có `date` cho lessons, giá trị null cho divergent, consumers cũ không vỡ.
- [x] Gates xanh toàn monorepo.

## Risk Assessment

**R1 (HIGH) Backfill sai hơn heuristic hiện tại:** signal UAT đối chiếu khác nữa pinned diff set — response: parity case-list chặn ở step 1+5 (test nằm workspace-server để thật sự chạy); generator in summary per-class để review tay.
**R2 (HIGH) Deploy seam:** signal enrollment giữa-window vào class có-đáng-lẽ-có-date — response: K1 single deploy unit (chính phase này), any-NULL-guard phía web P3 làm vành đai hiển thị.
**R7 (MEDIUM) D1 remote vs local drift:** runbook gọi đúng môi trường qua flag tường minh của wrangler (`--remote` vs local) — signal: script sinh SQL từ dump nhầm DB; response: output file nêu nguồn dump ( ngày/giờ/DB-id), runbook P5 documenting chính xác.
