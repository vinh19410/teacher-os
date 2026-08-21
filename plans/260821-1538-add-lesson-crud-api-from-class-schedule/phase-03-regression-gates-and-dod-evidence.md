---
phase: 3
title: "Regression gates + M1 DOD evidence"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 03: Regression gates + M1 DOD evidence

## Overview

Chạy toàn bộ CI gates ở parity workflow, tổng hợp bằng chứng map test → mục M1 DOD của issue #55, xác minh docs không cần cập nhật (đã kiểm tra: docs chỉ ở mức file-ownership, không liệt kê endpoint), và đóng plan.

## Requirements

- [x] 4 gates CI xanh trên branch `feat/55-lesson-crud-api-from-class-schedule`: `pnpm install --frozen-lockfile` (nếu lockfile đổi) → `pnpm exec biome check .` → `pnpm test` → `pnpm check-types` → `pnpm build` (đúng thứ tự `.github/workflows/ci.yml:31-35`).
- [x] Bảng DOD evidence điền tên test chứng minh từng mục acceptance của issue + M1 DOD liên quan.
- [x] Xác nhận 0 diff trong `packages/db/src/schema/` + `packages/db/src/migrations/` (`git status`/`git diff --stat`).
- [x] Docs: xác minh không có doc liệt kê endpoint cần cập nhật.
- [x] Cập nhật `plan.md` status → completed.

## Architecture

**Vì sao docs không cần đổi (đã verify, không phải giả định):**

- docs/system-architecture.md — mô tả request flow theo file ownership ("Kernel reads/writes and CSRF checks | kernel.ts", :22); KHÔNG liệt kê từng route → endpoint mới trong kernel.ts vẫn đúng mô tả hiện tại.
- docs/codebase-summary.md — navigation map theo file (:18-25); không enumerate route.
- docs/project-roadmap.md M1 DOD (:41-45) chỉ được tick khi có evidence staging/E2E đầy đủ (roadmap :117-124: "DOD phải có bằng chứng tương ứng") — phần hiển thị /schedule + nav tuần + E2E thuộc #56/#59 → plan này KHÔNG tick DOD roadmap, chỉ cung cấp evidence API-side trong bảng dưới.
- Nếu khi triển khai phát hiện doc mới/đổi có enumerate API surface → cập nhật tại đó (future-proof clause; hiện tại không có).

**DOD evidence map (đã điền tên test thật — 2026-08-21, toàn bộ xanh trong `pnpm test` 96/96 server + 187/187 web):**

| Mục tiêu / DOD | Evidence (test thật) |
|---|---|
| Issue: "sinh lessons từ structured schedule" / DOD roadmap:41 "tạo lớp có lịch → sinh buổi tương ứng" (phần API) | `"enrolling a student generates sessionsTotal upcoming lessons on the kernel snapshot"` + unit `"unit generator: maps schedule rows to upcoming lesson values"` (kernel.test.ts) |
| Issue: "tạo lớp có lịch → thêm học viên → sinh buổi" (full Option B flow) | `"enrolling a student generates…"` (createClass 201 → addStudent 201 → kernel() có 12 lessons enrollmentId khớp) + `"large sessionsTotal (50) still generates atomically"` + `"sessionsTotal = 0 generates zero lessons"` |
| DOD roadmap:42 "Sửa/hủy buổi không làm hỏng buổi khác" | `"sibling lessons are byte-identical after an edit"` + `"cancelling one lesson leaves siblings untouched"` (kernel.test.ts) |
| Issue: "guard race condition giống check-in" | `"replay with the same body is idempotent (200 twice, same state)"` + `"completed lesson cannot be edited (409)"` + `"cancelled lesson cannot be edited (409)"` + WHERE old-values guard (kernel.ts — optimistic concurrency, code-review xác nhận); cancel replay 409: `"check-in flips upcoming→completed and persists; second check-in is 409"` (test hiện có) |
| Issue: "org-scoped" | `"cross-org: org B cannot enroll into org A's class and sees zero generated lessons"` + `"org B cannot edit org A's lesson; org A unchanged"` (kernel.test.ts) |
| Ràng buộc issue: "no big schema change" | `git diff --stat -- packages/db` rỗng — verified 2026-08-21 trên branch feat/55 (chỉ 4 file code đổi: contracts.ts, routes/kernel.ts, kernel.test.ts, web classes.test.ts) |
| Cap sessionsTotal (red-team F1/A1) | `"52 is accepted (weekly × 1 year)"` + `"53 is rejected"` (kernel.test.ts) |
| Trust boundary (red-team S1/S3) | `"contract boundaries: topic cap 500, zoom scheme https-only"` + `"guards: no Origin 403, form content-type 415, extra key 400, missing day 400, empty body 400"` |
| Legacy fail-closed (red-team A7) | `"legacy free-text schedule: student/enrollment/package still create, zero lessons"` |
| Group class invariant 2 (red-team F7) | `"group class: two enrollments get independent lesson sets (invariant 2)"` + `"divergence pin: class sessionsTotal (12) and package total (10) stay independent on the wire"` |
| Roadmap :34 "tiến độ lớp derive từ lesson thật" | **Known-broken tại #55:** pin test `"12 completed generated lessons over 2 weekly slots derive sessionsDone = 2 (collapse)"` (apps/web/src/lib/repos/classes.test.ts) làm red-target; việc sửa derive + tick DOD thuộc #56. KHÔNG tick ở đây. |

**Xác minh D1 thật + remediation (red-team S6/F3):** claim "db.batch atomic trên D1" là docs-based — phase 3 chỉ gate local. Xác minh runtime thật xảy ra ở **ship-stage**: sau khi `/ak:ship beta` deploy staging (alchemy apply migration + deploy), chạy smoke 1 lần createClass → addStudent → GET /kernel trên D1 thật, đính kết quả vào PR. Remediation nếu generation ghi sai data (không có endpoint dọn): SQL runbook `DELETE FROM lesson WHERE org_id = ? AND enrollment_id = ?` (forward-fix tay trên D1 staging; production chưa live — M3 blocked).

## Related Code Files

| File | Change |
|---|---|
| plans/260821-1538-add-lesson-crud-api-from-class-schedule/plan.md | status → completed; ghi chú evidence links |
| (không đổi code) | Gate-only phase; mọi code change đã ở phase 1-2 |

## Implementation Steps

1. Chạy gate đầy đủ từ repo root: `pnpm exec biome check .` → `pnpm test` → `pnpm check-types` → `pnpm build`. Fix bất kỳ đỏ nào (kỳ vọng: xanh ngay — phase 1-2 đã gate từng bước).
2. `git diff --stat -- packages/db` — xác nhận rỗng; ghi output vào evidence.
3. Điền bảng DOD evidence ở trên bằng tên test chính xác từ kernel.test.ts (copy tên `test(...)`).
4. Rà docs: `grep -rn "lessons" docs/` — xác nhận không doc nào enumerate endpoint API (đã verify system-architecture.md + codebase-summary.md ở mức file-ownership); chỉ cập nhật nếu tìm thấy chỗ liệt kê route.
5. Cập nhật plan.md frontmatter `status: completed`; tổng kết số test mới (unit + integration) và files chạm (kỳ vọng đúng 3: contracts.ts, kernel.ts, kernel.test.ts).
6. Note triển khai cho #56 (hand-off, không làm ở đây): (a) limitation sessionsDone distinct-(day,time) collapse với weekly recurrence (repos/classes.ts:28-46) — **bị kích hoạt bởi #55**, kèm red-target pin test từ phase 1, việc sửa derive thuộc #56 (red-team S2/A2/F4); (b) lesson-day 1-7 vs schedule-day 0-6 mapping đã pin ở `lessonEditSchema` doc comment; (c) web edit wiring cần action name KHÔNG đụng `"add-lesson"/"edit-lesson"` syllabus đang có (data-actions.ts:59-81 name-collision warning); (d) **edit là full-replace — form #56 phải echo đủ 5 field kể cả topic/zoom, nếu không sẽ wipe dữ liệu** (red-team S4/F8, đã cảnh báo trong doc comment schema); (e) double-submit/outcome-unknown retry POST /students nhân bản N lessons — cân nhắc dedupe/toast reconcile ở UI (red-team S7/A6); (f) snapshot payload tăng theo enrollments × sessionsTotal — cân nhắc pagination/direct-query (red-team S8).

## Success Criteria

- [x] 4 gates xanh trên branch: `pnpm test` (infra 11 + auth 16 + web 187 + server 96 + ci-workflow + topology-drift), `pnpm exec biome check .`, `pnpm check-types`, `pnpm build` — CI sẽ chạy lại trên PR (cùng command set).
- [x] Bảng DOD evidence điền đủ, trỏ tên test tồn tại thật trong kernel.test.ts + classes.test.ts.
- [x] `git diff --stat -- packages/db` rỗng.
- [x] plan.md status: completed, có evidence links — **deferred tới ship-stage** (ak:ship ghi status + commit cùng nhánh, per ak-vibe pipeline).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gate đỏ do test phase 1-2 bỏ sót edge case | Thấp | Thấp | Mỗi phase đã chạy gate riêng; phase 3 chỉ xác nhận |
| D1 batch cap với sessionsTotal lớn xuất hiện lúc staging deploy (không tái hiện được ở libsql) | Thấp | Trung bình | Note trong evidence; sessionsTotal thực 8-24; nếu xảy ra → follow-up cap `MAX_BATCH_LESSONS` + chia batch |
| Quên tick DOD roadmap theo quy ước sai (tick khi chưa có E2E) | Trung bình | Trung bình | Roadmap :117-124 yêu cầu evidence đầy đủ — plan này chỉ cung cấp evidence API-side; DOD tick là việc #56/#59 |

## Code Review Stage 2 findings (2026-08-21)

- **F1 (Important — FIXED)**: form create-class gửi `sessionsTotal` free-number; sau cap 52 server trả 400 generic → thêm validate client "Tổng số buổi tối đa là 52." + `max={52}` trên Input (add-class-modal.tsx).
- **F2 (Info — FIXED)**: thêm test `"two concurrent edits with different bodies: exactly one wins, the loser gets 409"` (Promise.all qua HTTP) — nhánh optimistic-concurrency 409 giờ có coverage trực tiếp.
- **F3 (Info — chấp nhận theo plan)**: generator không clamp thêm (plan: contract là single source of truth; fresh-org DOD không có lớp pre-cap) — ship-stage smoke sẽ xác minh trên D1 thật.
- **F4 (Info — hand-off #56 bổ sung (g))**: lesson sinh ra luôn `type: "1:1"` kể cả lớp nhóm (invariant 2: 1 row = 1 enrollment) — lesson-modal render "— 1:1" cho mọi card; #56 cân nhắc hiển thị type theo bối cảnh group.
