---
phase: 5
title: "E2E + runbook + docs carve-out + supersession"
status: pending
priority: P2
effort: "1d"
dependencies: [3, 4]
---

# Phase 5: E2E + runbook + docs carve-out + supersession

## Overview

Chốt hạ: e2e phủ hai flow hành vi mới (hủy buổi tương lai, topic-on-occurrence-k), runbook deploy chuỗi migration 4 bước kèm verification SQL (K8), docblock/code-standards carve-out chính thức, và supersession hai chiều với issue #93 lẫn plan cũ. Sau phase này plan đóng vòng: requester có thể ship UAT với checklist đối chứng từng mốc.

## Requirements

- Functional:
  - E2E `apps/e2e/specs` mở rộng spec mới `session-occurrence.spec.ts`: login → class detail tab Buổi học → hủy buổi TƯƠNG LAI (badge flip + persist reload) → hoàn thành buổi đúng ngày (badge flip) → edit topic occurrence thứ k → assert hiển thị đúng row k ngay & sau reload.
  - E2e hiện hữu không vỡ: `class-operations.spec.ts` regression green; sửa doc-rot comment :150-151 leftover #93 nếu diff chạm file này (cleanup budget item của assessment #95).
- Non-functional:
  - Runbook section trong docs/production-release-runbook.md: **trình tự có gate cứng** (RT6/RT16):
    1. `drizzle-kit migrate` (cột date + index thường) — checklist `_journal.json` đã cập nhật qua generate-flow
    2. Deploy worker mới (generator ghi-date)
    3. Sinh backfill SQL từ dump `wrangler d1 execute --remote --json` → áp `--file=backfill.sql`
    4. Verification queries PASS: đếm NULL-date per-class (`SELECT class_id, COUNT(*) FROM lesson WHERE date IS NULL GROUP BY class_id;` — kỳ vọng chỉ divergent-class > 0) + detector trùng `(enrollment_id, date)` (`SELECT enrollment_id, date, COUNT(*) c FROM lesson WHERE date IS NOT NULL GROUP BY 1,2 HAVING c>1;` — kỳ vọng rỗng; **nếu có dup → chạy heal SQL kèm sẵn, preference: giữ row settled nếu chỉ MỘT row settled trong dup-group, còn lại tất cả-upcoming thì giữ id nhỏ nhất**)
    5. Migration unique index `(class_id, enrollment_id, date)` qua drizzle-kit generate file riêng
    6. SAU CÙNG mới enable endpoint P2 trên production flag/deploy tương ứng
    Kèm rollback note (rollback code an toàn vì column additive; forward-only data).
  - Supersession artifacts: comment trên issue #93 (trỏ plan dir + tóm tắt behavior changes); inline blockquote tại plan dir #93 phần DEFERRED "implemented by" trỏ ngược.
  - Docs ownership pass: cập nhật ownership-table trong docs/system-architecture.md + code-standards.md ghi nhận skeleton home tại packages/api (RT15).

## Architecture

Không có surface kỹ thuật mới — phase thu thập/checklists. CI gates giữ nguyên cấu hình hiện hữu (ci.yml:31-35, e2e.yml Playwright chromium :29-36) — spec mới tự nằm đúng quy ước existing helpers.ts pattern.

## Related Code Files

- Create: `apps/e2e/specs/session-occurrence.spec.ts`
- Modify: `docs/production-release-runbook.md`, `docs/code-standards.md`, `docs/system-architecture.md` (ownership-table), `apps/e2e/specs/class-operations.spec.ts` (doc-rot :150-151)
- Modify: `plans/260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc/plan.md` (blockquote supersession) — repo-local file change đi PR cuối

## Implementation Steps

1. E2E red (spec mới viết trước bằng chạy tay template data): seed class qua API helpers hiện hữu.
2. Flow hủy-future + complete-today + topic-edit-on-row-k assertions; persist-through-reload mỗi step.
3. Runbook deployment section theo 6-bước gate cứng ở Requirements (+ heal SQL dup + journal checklist).
4. Docs carve-out final pass: code-standards bullet mới ("fact-mutable-via-user-action được persist; derived-only-display thì không") + ownership-table skeleton packages/api + tham chiếu plan dir.
5. Supersession comments (repo files + gh comment lên #93).
6. Gates + full e2e suite xanh local trước PR.

## Success Criteria

- [ ] Spec session-occurrence xanh trên CI e2e workflow; toàn bộ suite khác green.
- [ ] Runbook 1 người lạ đọc-xong-làm-được test (mock walk-through) đủ 6 bước gate, có verification queries + heal SQL dup + rollback note.
- [ ] Issue #93 có comment supersession kèm link tương đối đến plan.md của dir này (không path máy-local).
- [ ] Doc-rot :150-151 đã dọn nếu PR chạm specs.
- [ ] Toàn bộ gates monorepo xanh.

## Risk Assessment

**R16 (MEDIUM) E2E flaky do timezone:** spec dùng date future-relative VN vs UTC runner — response tái sử dụng date-helpers UTC-anchor existing trong helpers specs (week-grid convention), KHÔNG Date.now() nội dòng.
**R17 (LOW) Runbook stale so release thực tế:** gắn version header ngày ship PR cuối + owner tag reviewer.
