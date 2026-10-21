---
title: "t-attendance: chụp modal điểm danh non-mutating khớp design v2"
description: "Sửa cặp ảnh design:compare t-attendance bị lệch trạng thái: app thêm data-testid cho link mở modal điểm danh, seed thêm học viên thứ 2 để buổi nhóm render link, và harness click modal qua appSteps."
status: completed
priority: P2
effort: 2h
issue: 403
branch: ai-handle-issue-403
tags: [bugfix, frontend, testing]
blockedBy: []
blocks: []
created: 2026-10-22
---

# Plan: t-attendance — view điểm danh non-mutating (issue #403)

## Overview

Cặp ảnh `t-attendance` trong harness `pnpm design:compare` đang so 2 trạng thái khác nhau:
design v2 chụp **modal Attendance** (mở từ nút Attendance trên `#/schedule`), app chụp
**tab mặc định "Sessions & practice"** của `/classes/{seed.classId}` (bằng chứng repro
pre-fix: `scripts/design-compare/.state/raw/new/t-attendance/desktop-light.png` — không có
modal, stat "1 học viên").

Root cause (đã chứng minh bằng code + repro + ghi chú #397):

1. `scripts/design-compare/screens.json` để `appSteps: []` cho `t-attendance` → app không
   bao giờ mở modal.
2. Link mở modal (`setModalIndex`, non-mutating, `class-sessions-section.tsx:254-266`) bị
   gate bởi `isGroupSession = attendees.length >= 2`, nhưng seed lớp chính
   (`apps/e2e/scripts/design-seed.ts` + `apps/e2e/specs/helpers-quiz.ts:108-142`) chỉ có
   **đúng 1 enrollment** (Phạm Bảo Ngọc) → link không bao giờ render. Nút `Điểm danh` duy
   nhất trên trang là nút commit check-in 1:1 (mutating seed) — click nó làm 5 viewport sau
   mất nút và ảnh dính state `Đang lưu…` (ghi chú #397 phase-01).

Fix ở đúng gốc (3 điểm chạm, không đụng cơ chế bootstrap seed của #397):

1. **App:** thêm `data-testid={`session-attendance-open-${s.index}`}` cho link mở modal —
   selector ổn định, phân biệt được với nút commit (theo convention động sẵn có
   `vocab-deck-row-${deck.id}`).
2. **Seed:** thêm học viên thứ 2 **Nguyễn Thu Hà** (trùng tên học viên `s1` của lớp `c2`
   trong design mock → roster app khớp roster design) vào lớp chính kèm 5 lesson rows cùng
   ngày/giờ/topic → các buổi thành nhóm → link render, nút commit 1:1 biến mất khỏi lớp
   này (hạn chế mutate của #397 mất hẳn ở màn này).
3. **Harness:** `t-attendance.appSteps = [{"clickFirst": "[data-testid='session-attendance-open-3']"}]`
   (buổi hôm nay = index 3 trong seed: dates −7/−3/0/+4/+9 ngày) → chụp modal điểm danh
   actionable (nút check-in từng học viên) khớp modal design (roster + nút per-student).

## Non-goals

- Không đổi cơ chế bootstrap seed/fixture của #397 (port isolation, kernel sync, wipe).
- Không đổi logic sản phẩm: gate `isGroupSession`, model check-in 1 nút, nút commit 1:1
  cho lớp 1:1 thật (regression #91) — chỉ dữ liệu seed thay đổi.
- Không đổi design v2 (repo `teacheros-design-v2` SHA ghim `7a53fc0f`).
- Không đổi các cặp ảnh khác ngoài các màn chịu ảnh hưởng dữ liệu (regenerate composite).

## Phases

1. `phase-01-app-testid-regression-test.md` — TDD: test regression cho testid + thêm
   `data-testid` vào link mở modal (red → green).
2. `phase-02-seed-group-roster.md` — seed enrollment thứ 2 + lesson rows cho lớp chính.
3. `phase-03-harness-appsteps-verify.md` — `appSteps` cho `t-attendance`, chạy harness
   end-to-end, regenerate composite các màn chịu ảnh hưởng, cập nhật verdict.

## Acceptance criteria

- [ ] `pnpm --filter web exec vitest run src/routes/_auth/classes/$classId.sessions.test.tsx`
      exit 0 (gồm test mới cho testid).
- [ ] `node scripts/design-compare/capture.mjs --side both --screens t-attendance` exit 0,
      log `18 ảnh, 0 lỗi` (6 design + 6 app + 6 ghép), không có `.state/errors.log`.
- [ ] 6 composite `plans/261020-1446-378-redesign-design-v2/screenshots/t-attendance/*.png`
      mới (mtime sau run), cột App hiển thị **modal điểm danh** (overlay + roster).
- [ ] Seed không bị mutate giữa các viewport: click duy nhất là mở modal (`setModalIndex`),
      zero POST check-in trong luồng capture.
- [ ] Composite các màn chịu ảnh hưởng (t-dashboard, t-class-detail, t-students,
      t-student-detail, t-schedule, t-reports, s-dashboard, s-classes, s-class-detail)
      được regenerate và rà mắt: không cặp nào vỡ cấu trúc.
- [ ] `pnpm check` + `pnpm check-types` exit 0.

## Scope lockdown (Advisor)

- 5 file code: `apps/web/src/components/class-detail/class-sessions-section.tsx`,
  `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`,
  `apps/e2e/scripts/design-seed.ts`, `scripts/design-compare/screens.json`,
  `scripts/design-compare/capture.mjs` (capture.mjs thêm theo red-team: guard zero-POST +
  unlink errors.log) + artifact composite/verdict trong `plans/261020-1446-378-redesign-design-v2/`.
- Merge target duy nhất: `develop` (ship mode beta). Không đụng `main`.

## Acceptance criteria

- [ ] `pnpm --filter web exec vitest run src/routes/_auth/classes/$classId.sessions.test.tsx`
      exit 0 (gồm test mới cho testid).
- [ ] `node scripts/design-compare/capture.mjs --side both --screens <10 màn chịu ảnh hưởng>`
      exit 0, `0 lỗi`, không failure `non-mutating screen bị POST` (guard Task 3.0 đo
      zero-POST bằng máy — red-team RT2Security #1).
- [ ] 6 composite `plans/261020-1446-378-redesign-design-v2/screenshots/t-attendance/*.png`
      mới (mtime sau run), cột App hiển thị **modal điểm danh** (overlay + roster).
- [ ] Seed không bị mutate giữa các viewport: click duy nhất là mở modal (`setModalIndex`),
      zero POST check-in được guard xác nhận trong run.
- [ ] Composite 10 màn chịu ảnh hưởng được regenerate từ CÙNG một seed run.
- [ ] Verdict: `grep -c 't-attendance.*#403'` = 6 và ghi chú cũ `Modal restyle v2` = 0
      trên các dòng t-attendance.
- [ ] `pnpm check` + `pnpm check-types` exit 0.

## Validation Log

- `ak plan validate plans/261022-0432-403-t-attendance-nonmutating-view` → `[OK] … is a
  valid plan directory` (format gate, 2026-10-22).
- Verification pass (controller, Light tier — 2 phase đầu): các claim file:line trong plan
  đã đối chiếu trực tiếp với code khi author (class-sessions-section.tsx:164,190-197,254-266;
  class-sessions.ts buildClassSessionsV2; design-seed.ts lessons/step-6; capture.mjs
  runSteps/app-loop/composite). Failed: 0.

## Red Team Review

3 reviewer thù địch song song (Security Adversary / Assumption Destroyer / Failure Mode
Analyst), mỗi finding bắt buộc có evidence `file:line`. Adjudication:

| # | Nguồn | Severity | Finding | Disposition |
|---|---|---|---|---|
| 1 | RT2Failure | High | Timezone skew 00:00–07:00 VN làm `session-attendance-open-3` không render | **Reject** — false positive, bất đẳng thức bị đảo chiều: `daysFromToday` dùng ngày UTC (design-seed.ts:225-226), `todayISOVietnam()` = UTC+7 (week-grid.ts:23-34) ⇒ VN-today ≥ UTC-today mọi thời điểm ⇒ `dateArrived` của buổi 0d luôn true. RT2Assumptions + RT2Security kiểm tra độc lập cùng kết luận ngược lại với finding. |
| 2 | RT2Security | High | Non-mutating chỉ đúng tình cờ; không guard đo zero-POST; acceptance hứa zero POST nhưng không verify | **Accept** — Task 3.0: guard `nonMutating` trong capture.mjs đếm POST `*/check-in`, FAIL nếu > 0. |
| 3 | RT2Failure + RT2Security + RT2Assumptions | High/Med | Verify verdict `grep 't-attendance.*PASS'` là no-op (6 dòng PASS cũ đã có sẵn) | **Accept** — ghim `grep -c 't-attendance.*#403'` = 6 và ghi chú cũ = 0 (Task 3.3). |
| 4 | RT2Assumptions | High | "Giữ raw design" sai (worktree chưa có raw design); chuỗi 2 lệnh chạy seed 3 lần, composite ghép từ 2 seed run | **Accept** — gộp thành MỘT lệnh `--side both --screens <10 màn>` sau khi xoá raw+composite (Task 3.2). |
| 5 | RT2Security | Med | `errors.log` stale gây FAIL ảo (capture.mjs chỉ ghi, không xoá khi sạch) | **Accept** — unlink khi run sạch + `rm -f` trong bước xoá cache. |
| 6 | RT2Security | Med | Email seed cứng va unique index `(org_id, lower(trim(email)))` khi chạy lại | **Accept** — email `design.roster2.${runToken}@test.local` theo pattern hiện có. |
| 7 | RT2Failure | Med | Race modal render sau click (settle chạy trước runSteps) | **Accept** — thêm `{ "wait": 400 }` vào appSteps. |
| 8 | RT2Failure | Low | Log `18 ảnh` chỉ đúng lần đầu (cache skip) | **Accept** — verify bằng exit code + đếm file, không ghim log text. |
| 9 | RT2Failure | Low | Task 3.2 xoá mất 6 PNG bằng chứng pre-fix mà plan.md dẫn nguồn | **Accept** — archive sang `.state/debug/t-attendance-prefix/` trước khi xoá. |

Đã kiểm tra và xác nhận an toàn (không phải finding): modal link là `setModalIndex` thuần
state không fetch (class-sessions-section.tsx:259); `data-testid` không mở attack surface;
seed không leak token/PII vào artifact commit (.state git-ignored, log api redact token);
index 1-based đúng; test fixture `mondayClass` cho TODAY = index 1; email mới không va
unique index; `PRAGMA busy_timeout` set trước mọi INSERT.

### Whole-Plan Consistency Sweep

- Sau adjudication: plan.md Scope lockdown + Acceptance criteria đã đồng bộ với phase-03
  (thêm capture.mjs, guard zero-POST, verify verdict `#403`); phase-02 email đổi sang
  runToken-suffix — không còn chỗ nào trong plan nhắc email cứng cũ.
- Phase-01 không đổi (finding không chạm app/testid).
- Không còn mâu thuẫn chưa giải quyết.
