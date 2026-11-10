---
title: "#658 — Tài liệu buổi học lớp manual 0 học viên bị 404"
description: "resolveSession ở materials.ts mặc định đòi dòng lesson; buổi manual chỉ có class_session → GET/attach/upload 404 SESSION_NOT_FOUND. Coi buổi tồn tại khi có lesson HOẶC class_session."
status: completed
priority: P1
effort: "2h"
tags: [bug, materials, sessions]
created: 2026-11-10
---

# #658 — Tài liệu buổi học lớp manual 0 học viên bị 404

## Overview

Bugfix route (ak-fix). Buổi học **manual** tạo khi lớp chưa có học viên active
(flow #649) chỉ sinh dòng `class_session` (kernel `apps/server/src/routes/kernel.ts`
~:2505 luôn insert `class_session`; `lesson` chỉ insert cho từng enrollment
active). Nhưng 3 route tài liệu buổi teacher trong
`apps/server/src/routes/materials.ts` — GET list (:823), POST attach (:850),
PUT upload file (:889) — gọi `resolveSession` (:391) ở chế độ mặc định đòi dòng
`lesson` → 404 `SESSION_NOT_FOUND` cho tới khi học viên đầu tiên enroll.

**Root cause đã chứng minh bằng code** (điều tra pre-plan):

- `kernel.ts` ~:2505: insert `class_session` vô điều kiện; vòng `for (const enr of activeEnrollments)` insert `lesson` — lớp 0 học viên → chỉ có `class_session`.
- `materials.ts` :391-427 `resolveSession`: `options.requireLesson === false` mới bỏ qua; mặc định query `lesson` và 404 khi không thấy.
- DELETE detach (:929) đã có sẵn `requireLesson: false` — không bị ảnh hưởng.
- Route student `apps/server/src/routes/student-materials.ts` resolve qua join `enrollment ⋈ lesson` — học viên chỉ tồn tại khi có enrollment active (activation sinh `lesson`) → **giữ nguyên**.
- `resolveCurriculumMaterials` (lib/session-curriculum-materials.ts) trả `[]` khi lớp/ngày không có dòng `lesson` → an toàn cho buổi chỉ có `class_session`.

**Hướng fix (theo gợi ý issue):** `resolveSession` chế độ mặc định coi buổi tồn
tại khi có dòng `lesson` **hoặc** `class_session` cùng `(orgId, classId, date)`.
Cờ `requireLesson: false` của DELETE giữ nguyên ngữ nghĩa (chỉ cần lớp thuộc
org). Route student không đổi.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Teacher routes (GET list / POST attach / PUT upload) hoạt động trên buổi chỉ có `class_session` | P1 |
| 2 | Dời buổi chỉ có `class_session` kéo `lesson_material` theo (cùng batch; bug mà fix #658 làm thành lỗi thật — kongming checkpoint) | P1 |
| 3 | Hành vi cũ với buổi có `lesson` và route student không đổi | P1 |
| 4 | Regression test TDD cho ca "lớp manual 0 học viên" (attach + move) | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Regression test + fix resolveSession](./phase-01-start.md) | Pending |

## Success Criteria

- [ ] GET `/api/classes/:classId/sessions/:date/materials` trên buổi chỉ có `class_session` → 200 (không còn 404 `SESSION_NOT_FOUND`), `items` rỗng và `curriculumMaterials` rỗng
- [ ] POST attach link trên buổi đó → 201, GET list trả item
- [ ] PUT upload file vào buổi đó → 201
- [ ] DELETE detach trên buổi đó → 200 (đã hoạt động, giữ nguyên)
- [ ] Negative control: ngày KHÔNG có `lesson` lẫn `class_session` (cùng lớp thuộc org) → vẫn 404 `SESSION_NOT_FOUND` cho GET/attach — resolve không được nới lỏng thành "lớp tồn tại là đủ"
- [ ] Dời buổi chỉ có `class_session` (POST `/edit` `moveDate`) → `lesson_material` chuyển sang ngày đích trong cùng batch; GET ngày cũ → 404; xoá tài liệu khỏi ngân hàng không 409
- [ ] Bất biến #658: học viên đầu tiên enroll/activate (tồn tại `enrollment` + `lesson` cùng date) thấy được tài liệu GV đã gắn trước đó qua student route
- [ ] Buổi có dòng `lesson`: hành vi không đổi (test cũ pass)
- [ ] Route student: không đổi (404 khi không có enrollment+lesson; test cũ pass)
- [ ] `pnpm check` sạch, `pnpm check-types` sạch, `pnpm --filter server test` pass (theo adjudication baseline của plan)

## Non-Goals

- **Holiday-shift mồ côi `lesson_material`** (phát hiện red-team; issue #659,
  blocked-by #658): activation cho lớp manual sinh `lesson` từ `classSession`
  rồi áp holiday shift lên `lesson` mà không đồng bộ `class_session`/
  `lesson_material` (`apps/server/src/routes/enrollment-activation.ts:444-451,517-521`)
  → tài liệu gắn ngày D có thể "mồ côi" khi ngày bị dời sang ngày bù. Khác với
  move-route (đã xử lý trong scope ở Task 1.2b), path holiday/activation là
  một luồng riêng — xử lý ở #659.
- Route student `student-materials.ts`: không đổi.
- Không đổi schema, không đổi kernel tạo buổi manual (chỉ block move của route
  occurrence edit).

## Ship Metadata

- Ship mode: `beta` (ak-ship beta, PR vào `develop`), kèm `--ship` (merge + CI convergence)
- Route: bugfix qua `/ak-fix --auto`
- Source issue: vinh19410/teacher-os#658
- Handover contract: `--advice` — mỗi phase có Failure Protocol; verify là so sánh cơ học (exit code/substring), không phải cảm tính.

## Validation Log

### Verification Results (Light tier — Fact Checker, 2026-11-10)

Claims checked: 10 | Verified: 10 | Failed: 0 | Unverified: 0

- `materials.ts`: resolveSession default gọi ở GET list :823, POST attach :850, PUT upload :889; DELETE :935 dùng `requireLesson: false` — VERIFIED (grep).
- `resolveSession` tại materials.ts:391-427, mặc định query `lesson` → 404 `SESSION_NOT_FOUND` — VERIFIED (read :391-427).
- `kernel.ts` ~:2505 luôn insert `class_session`, chỉ insert `lesson` cho enrollment active — VERIFIED (read :2499-2522).
- Schema `class_session` unique (classId, date); cột time/dur notNull, topic/zoom default "" — VERIFIED (packages/db/src/schema/class-session.ts).
- Route student resolve qua join `enrollment ⋈ lesson` — VERIFIED (student-materials.ts:44-67).
- `resolveCurriculumMaterials` trả null/[] khi ngày không có dòng `lesson` — VERIFIED (lib/session-curriculum-materials.ts:54-77).
- Barrel `@teacher-os/db/schema/index` export classSession (`schema.classSession`) — VERIFIED.
- `pnpm --filter server test` = vitest run; test helpers `createLink/json/upload/del/headers` tồn tại trong materials.test.ts — VERIFIED.
- Import path `@teacher-os/db/schema/class-session` đúng như kernel.ts:55 dùng — VERIFIED.
- Test describe "material bank and session materials" kết thúc ~:1142, trước block #655 — VERIFIED.

Không có decision point nào cần phỏng vấn user: hướng fix do issue #658 chỉ định trực tiếp, test theo pattern fixture sẵn có, scope hẹp (2 file). Số câu hỏi: 0 — hợp lệ theo quy tắc "chỉ hỏi genuine decision points".

## Red Team Review

### Session — 2026-11-10
**Reviewers:** 2 song song (Security Adversary + Assumption Destroyer, Light tier/Fact Checker) trên plan revision `261110-0550` pre-fix.
**Findings:** 9 raw → 7 unique sau dedupe (5 applied, 1 non-goal + follow-up, 1 refinement gộp) — 2 High, 5 Medium, 0 Critical.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Verify đỏ đòi substring `expected 200 to be` — vitest in received-first (`expected 404 to be 200`), gate tự dừng trên success path (S1=A1) | High | Accept | phase-01 Task 1.1 |
| 2 | Thiếu negative control: ngày không có `lesson` ∧ không có `class_session` phải vẫn 404 — chống over-widening "lớp thuộc org là đủ" (S2) | High | Accept | phase-01 Task 1.1 bước 3; plan.md Success Criteria |
| 3 | GET trên buổi manual không assert `curriculumMaterials` rỗng — drift mapping #655 lọt lưới (S3) | Medium | Accept | phase-01 Task 1.1 bước 4 |
| 4 | Task 1.3 mô tả sai `pnpm check` là `--write` (thật ra check-only, `package.json:23`) — remediate scoped 2 file, cấm `check:fix` toàn repo (S4=A2) | Medium | Accept | phase-01 Task 1.3 |
| 5 | Holiday-shift activation mồ côi `lesson_material` của buổi manual — ngoài scope #658, cần theo dõi (S5) | Medium | Accept (non-goal) | plan.md Non-Goals + follow-up issue |
| 6 | Bất biến nghiệp vụ #658 không được khóa: học viên đầu tiên phải THẤY tài liệu đã gắn trước enroll (A3) | Medium | Accept | phase-01 Task 1.1 bước 5; plan.md Success Criteria |
| 7 | Gate quét toàn workspace + Failure Protocol tuyệt đối → ngõ cụt khi văng nợ có sẵn; thiếu baseline (A4) | Medium | Accept | phase-01 Task 1.0 + Failure Protocol baseline exception |

**Fact-check:** 12 claim trọng yếu được cả 2 reviewer xác minh độc lập — 10 VERIFIED, 2 FAILED (chính là finding 1 & 4, đã sửa), số dòng plan khớp call-lines.

### Whole-Plan Consistency Sweep

- Soi lại `plan.md` + `phase-01-start.md` sau khi áp 7 finding: Verify đỏ
  (Task 1.1) giờ khớp định dạng message vitest received-first ở mọi chỗ nhắc
  đến trạng thái đỏ (Success criteria + Verify + checklist); "4 route" → "3
  route 404 + DELETE 200 nhờ requireLesson:false" thống nhất cả 2 file; mô tả
  `pnpm check` thống nhất với `package.json:23`; Success Criteria plan.md giờ
  phủ đủ negative control + student visibility + curriculumMaterials rỗng
  tương ứng các bước trong phase-01; Task 1.0 mới không đụng file scope nên
  không mâu thuẫn ràng buộc "KHÔNG sửa file nào khác" (baseline là chạy lệnh
  đọc, không phải sửa). Không còn contradiction nào.

### Kongming checkpoint (sau plan gates) — 2026-11-10

**Kết luận: GO có điều kiện.** 5 điều chỉnh, tất cả đã áp:

| # | Điều chỉnh | Disposition |
|---|------------|-------------|
| K1 | Move-route orphan: dời buổi chỉ có `class_session` không kéo `lesson_material` (`bucketMoved` đòi `lesson` ở đích, `kernel.ts:2222`) — fix #658 làm lỗi này thành lỗi giáo viên gặp thật | **Accept — mở scope Task 1.2b + test 1.1b** (scope 3 file). Cân nhắc: thay đổi hẹp (nới 1 điều kiện + đổi thứ tự trong cùng batch nguyên tử), cùng câu chuyện người dùng, không ship path mất tài liệu mà chính fix mở ra |
| K2 | Baseline exception "byte-for-byte" không bao giờ khớp (vitest in timing/thứ tự) | Accept — đổi thành "cùng tên test fail / cùng mã lỗi + file:line" |
| K3 | Success criteria Task 1.1 sai: vitest dừng ở assertion fail đầu → DELETE detach không chạy ở trạng đỏ | Accept — đã viết lại |
| K4 | Step 5 thiếu id tường minh (enr-manual/l-manual) + test phải cuối describe | Accept — đã bổ sung |
| K5 | Path `enrollment-activation.ts` thiếu prefix `apps/server/src/routes/` | Accept — đã sửa |

Rủi ro kongming nêu để review/PR: `resolveSession` chỉ nới đúng bằng
`(orgId, classId, date)` trên `classSession`; `requireLesson:false` không đổi;
`student-materials.ts` không có diff; `updatedRows` vẫn lấy từ phần tử [0]
của batch. Holiday-shift (#659) nay dễ gặp hơn sau fix — ghi rõ trong PR.

Sweep sau khi áp K1-K5: Goals/Success Criteria/Non-Goals/phase tasks khớp nhau
(scope 3 file, 2 test mới, Task 1.2b); không còn contradiction.
