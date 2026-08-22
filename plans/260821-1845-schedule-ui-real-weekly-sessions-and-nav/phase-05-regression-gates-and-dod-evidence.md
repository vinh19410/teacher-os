---
phase: 5
title: "Regression gates toàn diện + evidence block cho DOD M1 / issue #56"
status: pending
priority: P1
effort: "1h"
dependencies: [2, 3, 4]
---

# Phase 5: Regression gates + DOD evidence

## Overview

Chạy toàn bộ gates mirror CI, các grep gate scoped theo file, thu evidence cho DOD M1 của
issue #56. Roadmap `docs/project-roadmap.md:41-45` dùng checkbox theo MỐC (không per-issue)
→ KHÔNG edit roadmap trong PR này; soạn evidence block dạng issue comment (vibe pipeline post
lúc ship). Phase này không viết feature code — chỉ verify + evidence.

## Requirements

- Functional:
  - Chạy đủ và xanh 4 gate (đúng thứ tự CI `.github/workflows/ci.yml:31-35`):
    1. `pnpm test` (root — gồm turbo test tất cả packages + `test:ci-workflow` + `test:topology-drift`)
    2. `pnpm check-types`
    3. `pnpm exec biome check .` (READ-ONLY — KHÔNG `--write` trong gate)
    4. `pnpm build`
  - Grep gates (scoped ĐÚNG file, không grep toàn `apps/web/src` — "Tuần này" hợp lệ ở
    settings.tsx template Zalo). **Per-file tường minh (red-team #11/#12):**
    - NEGATIVE chung trên 4 file `apps/web/src/routes/_auth/schedule.tsx`,
      `apps/web/src/components/schedule/lesson-modal.tsx apps/web/src/components/schedule/lesson-edit-form.tsx
      apps/web/src/lib/mock-data.ts`: `grep -n "dayDates\|todayIdx\|GCal\|19–25"` → 0 kết quả.
    - NEGATIVE `/08` (chống fake-date concat) trên `lesson-modal.tsx` + `lesson-edit-form.tsx`:
      `grep -n "/08"` → 0 kết quả.
    - POSITIVE per-file (CHỈ file dùng nó): `schedule.tsx` match `week-grid` (import) +
      `validateSearch` + `useSearch` + `resolveWeek` + `formatWeekRange`; `lesson-modal.tsx`
      match `dateIso` + `formatDayMonth`; `lesson-edit-form.tsx` match `lessonEditSchema` +
      `Number(`; `mock-data.ts` KHÔNG thuộc nhóm POSITIVE (pure-data, không import UI lib).
  - **Semantics note cho issue (red-team #4) — đưa vào evidence block:** weekly-recurring slot
    semantics (lesson không cột ngày → slot lặp theo weekday, status là status series, lớp xong
    vẫn hiện slot mọi tuần, edit-vs-edit last-writer-wins, sessionsDone lower-bound khi 1:2
    check-in lệch) — owner đọc issue comment là nơi pin diễn giải này.
  - Soạn evidence block (markdown, cho issue #56 comment) gồm: (1) output tóm tắt 4 gates;
    (2) output grep gates; (3) mapping DOD: dòng roadmap 41 "hiển thị đúng trên /schedule, nav
    tuần hoạt động" → phase 2 + manual check reload `?week`; dòng 42 "Sửa/hủy buổi không làm
    hỏng buổi khác; check-in đúng trạng thái sau hard reload" → phase 4 + status persist qua
    snapshot (server tests #55 cover "không làm hỏng buổi khác" — full-replace WHERE-guard,
    `kernel.ts:471-516`); dòng 45 "0 CTA no-op" → mọi CTA trên schedule giờ có handler thật;
    (4) manual verify checklist (nav ±1 tuần, reload giữ tuần, today-highlight, sửa buổi đổi
    cột, check-in → F5 giữ trạng thái) — chạy trên dev server local, ghi kết quả từng mục.
  - Ghi evidence vào `plans/260821-1845-schedule-ui-real-weekly-sessions-and-nav/reports/`
    (file `evidence-56.md`) để orchestrator/pipeline dùng.
- Non-functional:
  - KHÔNG edit `docs/project-roadmap.md` (format không per-issue — quyết định đã ghi trong plan.md).
  - KHÔNG sửa code trong phase này; nếu gate đỏ → quay lại phase gây đỏ sửa, không patch nóng.

## Architecture

Evidence flow: local gates (giống CI 1:1) → outputs copy vào `reports/evidence-56.md` →
orchestrator review → pipeline post lên issue #56 lúc ship. DOD roadmap giữ nguyên trạng thái
checkbox (M1 tổng thể chỉ tick khi cả mốc xong — #59 E2E còn block trên #56).

## Related Code Files

- Create: `plans/260821-1845-schedule-ui-real-weekly-sessions-and-nav/reports/evidence-56.md`
- Modify: (không — code đã đóng băng sau phase 4)
- Delete: (không)

## Implementation Steps

1. **Tests Before** (verification-first cho phase verification): confirm working tree sạch
   (`git status` — mọi commit phase trước đã xong); ghi lại `git log -1 --oneline` làm base
   cho evidence.
2. **Refactor/Implement**: (không code) — chạy lần lượt 4 gate commands; lưu output (exit code
   + dòng cuối). Chạy 2 nhóm grep gate; lưu output.
3. **Tests After**: **pre-flight (red-team #5)** — stack local chạy qua root `pnpm dev`
   (turbo → alchemy dev port 8000, `packages/infra/package.json`) + `pnpm -F web start`
   (vite port 8001); KHÔNG dùng `pnpm -F web dev` / server `dev` (không tồn tại). Trước khi
   verify: check `apps/server/.env` tồn tại (Google OAuth, `README.md:60-65`) + biến
   `VITE_SERVER_URL` bắt buộc (`packages/env/src/web.ts:5-7`); stack lên + login được; có ≥1
   lớp structured với buổi upcoming (seed qua UI flow M1 nếu thiếu — tạo lớp structured + thêm
   học sinh → sinh lessons). Sau đó thực hiện manual verify checklist 6 mục ở Requirements;
   ghi PASS/FAIL từng mục vào evidence. Mọi FAIL → mở lại phase tương ứng (không sửa trong
   phase này).
4. **Regression Gate** (chính phase này): `pnpm test` && `pnpm check-types` &&
   `pnpm exec biome check .` && `pnpm build` — chạy lần cuối, tất cả exit 0.

## Success Criteria

- [x] 4 gate commands exit 0, outputs lưu trong `reports/evidence-56.md`.
- [x] Grep NEGATIVE trả 0 match; grep POSITIVE match đủ trên từng file.
- [ ] Manual checklist 6 mục (nav ±1, reload giữ tuần + dữ liệu, param rác fallback,
    today-highlight chỉ tuần hiện tại, sửa buổi đổi cột/giờ, check-in + F5 giữ trạng thái)
    — **BLOCKED bởi môi trường** (thiếu `apps/server/.env`, operator secrets issue #41):
    automated substitutes đã ghi trong `reports/evidence-56.md` mục 4; walkthrough staging
    là follow-up khi #41 unblock (comment bổ sung vào issue #56).
- [x] Evidence block hoàn chỉnh (markdown) — sẵn sàng post issue #56; roadmap KHÔNG bị edit.
- [x] Working tree không có code change mới sau phase 4 (trừ 8 fix từ code-review session).

## Risk Assessment

- **Gate đỏ ở phút chót** (vd biome format drift giữa các phase) — response pre-decided: nếu
  là format-only, chạy `pnpm exec biome check --write .` RỒI commit riêng + chạy lại gate
  read-only; nếu là logic/type → quay phase nguồn sửa, không hot-patch.
- **Manual verify cần server + data thật** (lớp có lịch + buổi upcoming) — dùng staging/dev DB
  hoặc tạo nhanh qua UI (tạo lớp structured + thêm học sinh vào lớp → sinh lessons). Signal:
  không có data → không verify được "hiển thị đúng" → response: tạo data qua flow M1 (chính
  là test luồng DOD).
- **Evidence bị lạc** (không vào reports/) → file path cố định
  `plans/260821-1845-schedule-ui-real-weekly-sessions-and-nav/reports/evidence-56.md`; orchestrator
  biết đường dẫn từ success criteria.
