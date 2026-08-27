---
phase: 5
title: "E2E + runbook + docs carve-out + supersession"
status: completed
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
  - Runbook section trong docs/production-release-runbook.md: **chuỗi A/B/C shaped-theo-deploy (red-team round-2 N3 — đã xác minh `docs/production-release-runbook.md` "Alchemy applies D1 migrations as part of the deploy", forward-only; KHÔNG tồn tại feature-flag server)**. Mọi file migration merged sẽ tự áp ở deploy kế tiếp ⇒ thứ tự an toàn bắt buộc là **tách PR**, không phải thủ thuật flag:
    - **Step A (1 PR):** migration cột `date` + index thường + generator ghi-date + toàn bộ code P2–P4 (KHÔNG chứa unique-index migration). Merge → `pnpm alchemy deploy --stage prod` (Alchemy tự áp ALTER). Class mới tạo từ đây fully-dated ⇒ render v2, endpoints sống safe-on-by-default: date-addressed UPDATE chỉ match row CÓ date ⇒ class cũ toàn NULL là no-op `{updated:0}` và UI không sản xuất được call sai (modal entry-gate cần read-path v2) — KHÔNG cần env-toggle (kongming CONFIRM).
    - **Step B (operator):** dump `wrangler d1 execute --remote --json` → sinh backfill SQL (offline generator P1) → áp `--file=out.sql` → **delta re-dump loop**: nếu enrollment/lesson phát sinh TRONG cửa sổ dump→apply (query `WHERE created_at > <dump-ts> OR date IS NULL` có kết quả trên class conform), re-dump delta → regenerate → áp lại tới khi verification PASS.
    - **Verification queries PASS (kỳ vọng tách scope pre/post-deploy — risk cửa-sổ-không-đóng-băng):**
      1. Đếm NULL-date per-class (`SELECT class_id, COUNT(*) FROM lesson WHERE date IS NULL GROUP BY class_id;`) — kỳ vọng chỉ divergent-class > 0; output LƯU DANH SÁCH class_id NULL kèm lý-do fail conforms (từ summary của generator P1) để operator biết blast-radius v2-coverage (kongming D1-sharpen).
      2. Detector trùng `(enrollment_id, date)` (`SELECT enrollment_id, date, COUNT(*) c FROM lesson WHERE date IS NOT NULL GROUP BY 1,2 HAVING c>1;`) — kỳ vọng RỖNG trên tập class PRE-deploy-A (so created_at với deploy-ts); traffic post-deploy-A được generator bảo đảm nên dup nhóm này nghĩa lỗi else — heal ngay.
      3. Detector misalignment (kongming GO-D5): per bucket `(class_id, date)` sid-count < số enrollment của class ⇒ flag — Known Limitation enrollment-mid-moveDate, heal DB-only.
      Heal SQL dup kèm sẵn, preference: giữ row settled nếu chỉ MỘT row settled trong dup-group, còn lại tất cả-upcoming thì giữ id nhỏ nhất.
    - **Step C (PR RIÊNG, SAU khi verification PASS đã lưu output):** migration unique index `(class_id, enrollment_id, date)` ALONE — checklist heal-dup-rồi-mới-apply (traffic post-A có thể đã sinh dup); deploy này Alchemy tự áp index. Bật "endpoint P2" == chính deploy Step A, an toàn nhờ gate Step B/C phía trên kiểm soát rủi ro data-thật (dup/misalign), không phải kiểm soát endpoint.
    - Rollback note (red-team round-2 N10): rollback worker về image cũ AN TOÀN hiển thị (any-NULL ⇒ legacy) NHƯNG generator cũ ghi date=NULL cho enrollment mới trong class đã dated ⇒ hệ thống KHÔNG ổn định cho đến khi re-deploy worker mới + chạy lại delta backfill (bước B loop); migration column additive forward-only.
  - Supersession artifacts: comment trên issue #93 (trỏ plan dir + tóm tắt behavior changes); inline blockquote tại plan dir #93 phần DEFERRED "implemented by" trỏ ngược.
  - Docs ownership pass: cập nhật ownership-table trong docs/system-architecture.md + code-standards.md ghi nhận skeleton home tại packages/api (RT15).

## Architecture

Không có surface kỹ thuật mới — phase thu thập/checklists. CI gates giữ nguyên cấu hình hiện hữu (ci.yml:31-35, e2e.yml Playwright chromium :29-36). **Seeding API không tồn tại sẵn (red-team round-2 N13): `apps/e2e/specs/helpers.ts` hiện chỉ có UI-driven (`signUpViaUi`, `openClassScheduleTab`, `vietnamTodayISO`) — spec mới cần request-helper mới: Playwright `request` fixture với cookie-jar từ một lần bootstrap `signUpViaUi` + header `Origin` PHẢI khớp đúng `deps.corsOrigin` của server (middleware kernel.ts:117-127 fail-closed) cho POST/JSON-only.**

## Related Code Files

- Create: `apps/e2e/specs/session-occurrence.spec.ts`
- Modify: `docs/production-release-runbook.md`, `docs/code-standards.md`, `docs/system-architecture.md` (ownership-table), `apps/e2e/specs/class-operations.spec.ts` (doc-rot :150-151)
- Modify: `plans/260827-0941-session-actions-bo-cot-hoc-vien-tab-buoi-hoc/plan.md` (blockquote supersession) — repo-local file change đi PR cuối

## Implementation Steps

1. E2E red: **tạo request-context helper (cookie jar + Origin==corsOrigin) trong specs/helpers mở rộng — step tường minh vì helper API seeding chưa tồn tại (N13)**; spec mới viết trước bằng chạy tay template data.
2. Flow hủy-future + complete-today + topic-edit-on-row-k assertions; persist-through-reload mỗi step.
3. Runbook deployment section theo chuỗi A/B/C ở Requirements (+ heal SQL dup + detector misalignment + NULL-class archive list + delta re-dump loop).
4. Docs carve-out final pass: code-standards bullet mới ("fact-mutable-via-user-action được persist; derived-only-display thì không") + ownership-table skeleton packages/api + tham chiếu plan dir.
5. Supersession comments (repo files + gh comment lên #93).
6. Gates + full e2e suite xanh local trước PR.

## Success Criteria

- [x] Spec session-occurrence xanh trên CI e2e workflow; toàn bộ suite khác green.
- [x] Runbook 1 người lạ đọc-xong-làm-được test (mock walk-through) đủ chuỗi A/B/C, có verification queries 3 detector + heal SQL dup + rollback procedure (re-deploy worker + delta backfill) + NULL-class archive list.
- [x] Issue #93 có comment supersession kèm link tương đối đến plan.md của dir này (không path máy-local).
- [x] Doc-rot :150-151 đã dọn nếu PR chạm specs.
- [x] Toàn bộ gates monorepo xanh.

## Risk Assessment

**R16 (MEDIUM) E2E flaky do timezone:** spec dùng date future-relative VN vs UTC runner — response tái sử dụng date-helpers UTC-anchor existing trong helpers specs (week-grid convention), KHÔNG Date.now() nội dòng.
**R17 (LOW) Runbook stale so release thực tế:** gắn version header ngày ship PR cuối + owner tag reviewer.
