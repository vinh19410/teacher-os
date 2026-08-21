---
title: "Schedule UI: buổi học sinh từ lịch thật + nav tuần hoạt động (issue #56)"
description: "Route /schedule hiển thị buổi học từ lesson rows thật với ngữ nghĩa weekly-recurring theo weekday, nav tuần trước/sau/trên đây điều khiển bằng URL search param (reload-safe), highlight hôm nay thật, sửa/hủy buổi qua form echo đủ 5 field, và fix derive sessionsDone collapse (hand-off #55)."
status: completed
priority: P1
effort: 9h (~1 ngày)
branch: feat/56-schedule-ui-weekly-nav
issue: 56
tags: [frontend, m1, schedule]
created: 2026-08-21
---

# Schedule UI: buổi học sinh từ lịch thật + nav tuần hoạt động (issue #56)

## Overview

Issue #56 (M1): `/schedule` hiện là grid thuần weekday — mọi lesson `day=2` hiện ở cột T3
của MỌI tuần, không nav tuần, không ngày thật, không highlight "hôm nay" (PR #58 đã gỡ sạch
fake chrome; đây là phần wire THẬT thay thế). Lesson row không có cột ngày tháng
(`packages/db/src/schema/lesson.ts:16-44` — chỉ `day` 1-7 Mon-first), nên "buổi trong tuần"
được derive theo ngữ nghĩa **weekly-recurring slot**: cột của tuần = lesson có weekday khớp
(chính là filter `l.day === i + 1` sẵn có tại `apps/web/src/routes/_auth/schedule.tsx:29-32`,
cùng ngữ nghĩa `lessonDayFromDate` của dashboard tại `apps/web/src/lib/dashboard-from-kernel.ts:7-10`).

Tuần đang chọn là **URL state** (`?week=<iso>`) qua `validateSearch` mới — reload giữ đúng tuần
by construction. Kèm theo: (1) tripwire lock `kernel-runtime.contract.test.ts:185-209` được
cập nhật CÙNG phase UI theo đúng chỉ dẫn trong comment của nó; (2) fix derive `sessionsDone`
collapse (hand-off chính thức #55 mục (a)); (3) form sửa buổi echo đủ 5 field (full-replace API,
hand-off mục (d)); (4) gates + evidence cho DOD M1. Không đổi server — mọi endpoint đã có từ #55.

## Bối cảnh evidence (đã re-verify trên worktree feat/56-schedule-ui-weekly-nav, base develop sau PR #74)

Nguồn: `plans/260821-1845-schedule-ui-real-weekly-sessions-and-nav/reports/scout-schedule-ui-evidence.md` —
mọi cite dưới đây đã được đọc lại trực tiếp từ source trên worktree này.

- **Route hiện tại**: `apps/web/src/routes/_auth/schedule.tsx:21-115` — `PageHead title="Lịch dạy"`
  không lead (dòng 27); grid 7 cột `dayNames.map((dn, i) => ...)` filter `l.day === i + 1` + sort
  theo time (dòng 29-32); status styling `completed → opacity-60`, `cancelled → opacity-35` +
  line-through (dòng 57-61); legend 5 loại buổi thật (dòng 87-108); `LessonModal` mở theo
  `openLessonId` (dòng 23, 53, 109-112). Không nav tuần, không ngày, không today highlight.
- **Modal**: `apps/web/src/components/schedule/lesson-modal.tsx` — badge trạng thái dòng 47-55;
  nút "Hủy buổi"/"Điểm danh" qua `useDirectKernelAction` với `disabled={busy || isPending(lesson.id)}`
  (dòng 68-92); time hiển thị `lessonDayLabel(lesson.day) · {time} ({dur} phút)` (dòng 38) — chỉ tên thứ, chưa có ngày.
- **Mô hình lesson**: `packages/db/src/schema/lesson.ts:16-44` — `day` 1-7 (1=Monday), KHÔNG có cột
  ngày. Generator `apps/server/src/routes/kernel.ts:81-104` sinh `sessionsTotal` row **per enrollment**
  (`generateScheduleLessons` nhận một `enrollmentId`), `day = scheduleDay + 1`, comment dòng 72-80 pin
  off-by-one 3 quy ước ngày.
- **API đã có (#55)**: `POST /api/lessons/:id/check-in|/cancel` (`kernel.ts:455-461`, guard
  upcoming-only + conditional write 409); `POST /api/lessons/:id/edit` (`kernel.ts:471-516`) —
  upcoming-only, **full-replace 5 field** + optimistic concurrency (old values trong WHERE →
  mismatch 409 "lesson changed or is not upcoming"). Contract `packages/api/src/contracts.ts:157-177`
  `lessonEditSchema` (day int 1-7, time TIME_REGEX, dur int 1-1440, topic ≤500 default "", zoom ""|https:// ≤2048)
  + WARNING "omitted optional fields reset to \"\" — send all five fields".
- **Status tuple**: `"upcoming" | "completed" | "cancelled" | "absent"`
  (`contracts.ts` KernelLessonRow ~dòng 300; web `apps/web/src/lib/mock-data.ts` LessonStatus).
  Check-in đã persist server-side; reload = fetch snapshot mới `['kernel']` — UI chỉ cần đọc đúng status.
- **sessionsDone collapse bug**: `apps/web/src/lib/repos/classes.ts:28-46` đếm DISTINCT `${day}|${time}`
  per class → 12 buổi trên 2 slot check-in đủ vẫn ra 2/12. Pin test đỏ có chủ đích:
  `apps/web/src/lib/repos/classes.test.ts:289-345` ("issue #55 red-target for #56", comment
  "do not 'fix' it here without updating that issue" — issue đó là #56, tức plan này).
  Comment derive (classes.ts:14-18) ghi invariant 7: buổi 1:2 (1 row/enrollment) phải tính 1 buổi.
  DB column `sessionsDone` legacy không writer — "Do not trust it" (`contracts.ts` KernelClassRow).
  Class detail hiển thị progress từ derive này: `$classId.tsx:67-68` (percent) + `:110` (`num={cls.sessionsDone}/{sessionsTotal}`).
- **Data flow (không fetch thứ hai)**: một query key duy nhất `["kernel"]`
  (`apps/web/src/lib/repos/kernel.ts:286`), `DataProvider` gate toàn app
  (`apps/web/src/lib/data-provider.tsx:60-157`), mọi route đọc `useData()`. Write qua command bus
  serialized (`kernel.ts:333-414`) → `kernelCommand(action)` map action→endpoint
  (`kernel.ts:37-127`) → POST + refetch `['kernel']`. Hook pattern: `apps/web/src/lib/repos/use-classes.ts` ("No second fetch").
- **Action map collision**: `apps/web/src/lib/data-actions.ts:59-81` — `"add-lesson"`/`"edit-lesson"`
  đã thuộc syllabus lesson (hand-off #55 mục (c)) → action edit buổi học phải dùng tên KHÁC.
  `check-in`/`cancel-lesson` ở dòng 5-6 là tiền lệ đặt tên cho class-lesson.
- **Outcome/toast infra**: `apps/web/src/lib/use-direct-kernel-action.ts` (run/isPending/busy) +
  `apps/web/src/lib/kernel-outcome.ts:31-38` — definite-failure 409 có heal-409 path ("Dữ liệu
  đã được cập nhật trước đó — đang tải lại"). **Red-team #1 correction:** path này chỉ đúng cho
  status-race (check-in/cancel trùng); endpoint edit pre-read values trong cùng request
  (`kernel.ts:479-508`) nên edit-vs-edit là last-writer-wins, KHÔNG phải optimistic-concurrency 409.
- **Routing**: TanStack Router file-based, `routeTree.gen` (untracked, sinh bởi
  `@tanstack/router-plugin` khi build/dev; web `check-types` = `vite build && tsc --noEmit`
  nên routeTree tự regenerate). Tiền lệ validateSearch duy nhất: `apps/web/src/routes/login.tsx:17-23`.
  Layout `_auth/route.tsx` beforeLoad giữ nguyên `location.href` (incl. search) cho returnUrl → nav tuần qua URL ăn khớp re-auth flow.
- **Date utils hiện có**: KHÔNG date-fns/dayjs. `apps/web/src/lib/date-input.ts` (parse/format
  yyyy-mm-dd + roundtrip check); server `apps/server/src/routes/kernel.ts:716-722` `Intl.DateTimeFormat`
  với `timeZone: "Asia/Ho_Chi_Minh"` (UTC-drift guard) — pattern mirror cho "hôm nay" phía web.
  CI chạy UTC → mọi date math mới phải anchor UTC-midnight trên chuỗi ISO.
- **Tripwire locks**: `apps/web/src/lib/kernel-runtime.contract.test.ts:185-209` — negative locks
  cho #58 (GCal, todayIdx, dayDates, "19–25/08", "← Trước", "Sau →", "Tuần này" trên schedule.tsx;
  dayDates + "/08" trên lesson-modal) kèm comment "update this lock together with the feature, not before".
- **Test convention**: vitest `environment: "node"` (`apps/web/vitest.config.ts`) — KHÔNG jsdom/
  testing-library/E2E (E2E là #59). Test = pure unit (`src/lib/**/*.test.ts`) + source-contract
  qua `readSrc()` (pattern `kernel-runtime.contract.test.ts:160-183`). `repos/kernel.test.ts:295-453`
  có sẵn describe `kernelCommand` cho test mapping action mới.
- **CI**: `.github/workflows/ci.yml:31-35` — `pnpm exec biome check .` → `pnpm test` →
  `pnpm check-types` → `pnpm build`. Web có `zod` dependency (`apps/web/package.json`) → import
  `lessonEditSchema` từ `@teacher-os/api/contracts` chạy được, không tự viết schema thứ hai.
- **DOD M1**: `docs/project-roadmap.md:41-45` — dòng 41 "tạo lớp có lịch → sinh buổi tương ứng,
  hiển thị đúng trên /schedule, nav tuần hoạt động"; dòng 42 "Sửa/hủy buổi không làm hỏng buổi
  khác; check-in đúng trạng thái sau hard reload"; dòng 45 "0 CTA no-op trong luồng classes/schedule".
  Format checkbox theo MỐC (không per-issue) → plan không edit roadmap; evidence post lên issue.
- **Hand-off #55** (`plans/260821-1538-add-lesson-crud-api-from-class-schedule/phase-03-regression-gates-and-dod-evidence.md:65`):
  (a) fix sessionsDone thuộc #56; (d) form edit phải echo đủ 5 field; (c) tránh đụng tên action
  `"add-lesson"/"edit-lesson"`. PM status 2026-08-21: "#59 blocked bởi #56".

## Quyết định scope

**Trong scope:**
- `week-grid.ts` pure lib mới (không deps mới) — mọi date math ISO/UTC-anchored, clock injectable.
- URL-driven week state qua `validateSearch` trên `/_auth/schedule` + nav 3 nút thật.
- UI thật: lead "Tuần {range} · N buổi", sub-label ngày dd/MM mỗi cột, today-highlight theo
  `todayISOVietnam()`, modal ngày thật theo cell (`dateIso` prop).
- Cập nhật tripwire locks `kernel-runtime.contract.test.ts:185-209` CÙNG phase UI (bỏ negative
  locks cho nav labels, giữ negative locks cho fakes, thêm positive locks cho wiring thật).
- Fix derive `sessionsDone` trong `repos/classes.ts` + flip pin test `classes.test.ts:289-345`.
- Form sửa buổi (echo đủ 5 field) trong LessonModal + action `lesson-edit` mới qua command bus.
- Regression gates + evidence block cho issue #56.

**Ngoài scope (đừng làm):**
- Server/API thay đổi — mọi endpoint đã tồn tại từ #55; KHÔNG đụng `apps/server`, `packages/api`, `packages/db`.
- E2E/browser infra (jsdom, testing-library, Playwright) — issue #59.
- Zalo/GCal integration — non-goal roadmap (`docs/project-roadmap.md:20`).
- Dashboard/grouping/at-risk thay đổi; class-detail tab "Lịch học" redesign (cột weekday-only giữ nguyên).
- Dedupe double-submit POST /students (hand-off #55 mục (e)) — issue riêng.
- DB column `sessionsDone` — legacy, giữ nguyên, không writer.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Pure lib `week-grid.ts` timezone-safe (UTC-anchored, clock injectable) với unit test đầy đủ biên tháng/năm/năm nhuận | P1 |
| 2 | `/schedule?week=<iso>`: grid tuần thật (sub-label dd/MM, today-highlight thật, lead "Tuần {range} · N buổi"), nav ← Tuần trước / Tuần này / Tuần sau → hoạt động, đúng sau reload | P1 |
| 3 | Trạng thái buổi khớp check-in/điểm danh hiện có sau reload (status từ snapshot `['kernel']`; verify, không đổi semantics) | P1 |
| 4 | `sessionsDone` derive từ lesson rows thật: weekly recurrence đủ 12/12, buổi 1:2 không double-count, cancelled không đếm | P1 |
| 5 | Form sửa buổi echo đủ 5 field (day/time/dur/topic/zoom), upcoming-only, validate zod, qua command bus, close-CHỈ-khi-refreshed (giữ form + input khi fail — doctrine write-modal repo); last-writer-wins của edit-vs-edit được ghi nhận tường minh | P1 |
| 6 | Tripwire locks cập nhật cùng feature; gates xanh mirror CI; evidence block DOD M1 chuẩn bị cho issue #56 | P1 |

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| [1](./phase-01-week-grid-lib.md) | Pure lib week-grid (ISO/UTC, timezone VN) + unit tests | Pending | 1h30 |
| [2](./phase-02-schedule-week-nav-ui.md) | Schedule UI tuần thật + nav URL + tripwire locks | Pending | 2h30 |
| [3](./phase-03-sessions-done-derive-fix.md) | Fix derive sessionsDone + flip pin test | Pending | 1h30 |
| [4](./phase-04-lesson-edit-form.md) | Form sửa buổi (echo đủ 5 field) + action `lesson-edit` | Pending | 2h30 |
| [5](./phase-05-regression-gates-and-dod-evidence.md) | Regression gates + DOD evidence | Pending | 1h |

Dependencies: 1 → 2 → 4 → 5; 3 ĐỘC LẬP (dependencies: [] — chỉ đụng `repos/classes.ts` +
`repos/classes.test.ts`, không dùng week-grid, không đụng lesson-modal/schedule) → 5 chờ tất cả.
Phase 4 đụng thêm vùng `kernel-runtime.contract.test.ts` (thêm assertion mới, không sửa vùng
phase 2 đã viết).

## Success Criteria

- [ ] `/schedule` hiển thị lead "Tuần {dd–dd/mm} · {N} buổi" với N = số **slot distinct** (distinct
  `day|time` của lesson chưa hủy — buổi 1:2 chiếm 1 slot, đúng nghĩa timetable tuần); mỗi cột có
  sub-label ngày `{dd/MM}` tương ứng tuần đang chọn.
- [ ] Nav "← Tuần trước / Tuần này / Tuần sau →" đổi tuần thật; URL chứa `?week=<iso-yyyy-mm-dd>`;
  reload (F5) giữ đúng tuần đang xem và đúng dữ liệu cột.
- [ ] Vào `/schedule` không param → tuần hiện tại theo giờ Việt Nam (`Asia/Ho_Chi_Minh`), kể khi CI/máy UTC.
- [ ] Param `?week` rác (ví dụ `abc`, `2026-13-40`, năm ngoài 1970–2099) → fallback tuần hiện tại,
  KHÔNG crash, VÀ URL được dọn sạch (replace về `/schedule` không param) — không desync URL/view.
- [ ] Nav ở biên năm hợp lệ (năm 9999/0001 không xuất hiện; `addWeeks` output luôn khớp
  `^\d{4}-\d{2}-\d{2}$`, guard trả về input khi vượt bound).
- [ ] Cột "hôm nay" chỉ highlight khi ngày thật của tuần đang xem trùng `todayISOVietnam()`; tuần
  khác/không chứa hôm nay → không cột nào highlight.
- [ ] Trạng thái buổi (opacity/line-through/badge) khớp `lesson.status` từ snapshot sau reload —
  check-in rồi F5 vẫn "Hoàn thành"; hủy rồi F5 vẫn "Đã hủy" (verify bằng test hiện hữu + manual evidence).
- [ ] Lớp 12 buổi trên 2 slot (weekly recurrence), check-in đủ 12 → progress 12/12 (test flip từ pin đỏ).
- [ ] Lớp 1:2 (2 enrollment × 12 buổi) check-in đủ → 12/12 (không phải 24/12); buổi cancelled không đếm.
- [ ] Lớp 1:2 check-in LỆCH nhau (A dự tuần 1-6, B dự tuần 7-12) → derive là **lower-bound có tài
  liệu** (test pin hành vi + JSDoc ghi giới hạn; đúng 100% occurrence đòi cột ngày ở DB — ngoài scope).
- [ ] Modal buổi hiển thị "{thứ}, {dd/MM} · {time} ({dur} phút)" của đúng cell tuần đang xem.
- [ ] Form "Sửa buổi" với buổi upcoming echo đủ 5 field (state string DOM → coerce `Number()` cho
  day/dur trước khi `safeParse`); submit gửi day/time/dur/topic/zoom; buổi chuyển cột/đổi giờ đúng
  sau refetch; buổi không-upcoming không có nút sửa.
- [ ] Form sửa CHỈ đóng khi outcome `refreshed`; `definite-failure`/409 → giữ form + input người
  dùng, hiện thông báo lỗi (doctrine `kernel-runtime.contract.test.ts:93-117` "form modals close
  and reset only on the refreshed result"); state `editing` reset khi đóng/đổi lesson (useEffect
  mirror grade-modal `:319-326`).
- [ ] Edit-vs-edit 2 tab: đã ghi nhận là **last-writer-wins** (server pre-read trong cùng request
  `kernel.ts:479`, client không gửi old-values — 409 chỉ xảy ra khi status không còn upcoming).
  Hạn chế này được post lên issue #56 cùng evidence; 409-heal path chỉ claim cho status-race.
- [ ] KHÔNG thêm query key/fetch mới; KHÔNG thêm npm dependency; KHÔNG đổi server/api/db.
- [ ] Gates xanh (mirror CI `.github/workflows/ci.yml:31-35`): `pnpm test`, `pnpm check-types`,
  `pnpm exec biome check .` (read-only), `pnpm build`.
- [ ] Evidence block (commands + outputs + file:line) soạn sẵn cho issue #56 / DOD M1 dòng 41-42, 45.

## Risk Assessment

- **Off-by-one 3 quy ước ngày** (schedule JSON 0-6 Mon-first; lesson.day 1-7 Mon-first; JS
  `getDay()` 0=Sunday) — bug thầm lặng, đã pin ở `kernel.ts:72-80`, `format-schedule.ts:46-52`,
  `dashboard-from-kernel.ts:4-6`. Mitigation: JSDoc pin cả 3 quy ước ngay đầu `week-grid.ts` +
  unit test biên (CN → tuần trước; T2 → cùng tuần) + KHÔNG dùng `getDay()` trần trong lib
  (chỉ dùng qua anchor UTC).
- **Timezone/CI-UTC drift**: "hôm nay" tính sai trên máy UTC (17:00 UTC = ngày sau ở VN).
  Mitigation: `todayISOVietnam` qua `Intl.DateTimeFormat` + `timeZone: "Asia/Ho_Chi_Minh"`
  (mirror `kernel.ts:716-722`); mọi phép toán tuần trên chuỗi ISO anchor UTC-midnight; test với
  clock cố định vắt lằn mức ngày (18:30Z = 01:30 ngày hôm sau ở VN).
- **Quên cập nhật tripwire lock cùng UI** → CI đỏ ở `kernel-runtime.contract.test.ts:185-209`
  (chính comment của lock yêu cầu update-together). Mitigation: lock update là bước bắt buộc
  TRONG phase 2, không phải việc dọn sau.
- **sessionsDone derive mới phá invariant 7 (buổi 1:2 = 1 buổi)**: plain row-count một lớp 1:2
  (2 enrollment × N buổi) sẽ ra 2N > sessionsTotal. Mitigation: derive nhóm theo `enrollmentId`
  rồi lấy max mỗi class — weekly-recurrence đủ N/N VÀ 1:2 không double-count; test cả hai case.
  **Giới hạn đã biết (red-team)**: 1:2 check-in lệch nhau (mỗi học sinh vắng buổi khác nhau) →
  max là LOWER-BOUND (A=6, B=6 nhưng lớp đã dạy 12) — pin bằng test interleaved + JSDoc ghi rõ;
  đếm đúng 100% occurrence đòi cột ngày ở DB (ngoài scope #56, ghi nhận lên issue).
- **Diễn giải weekly-recurring slot cần minh bạch với issue owner (red-team)**: lesson không có
  cột ngày nên grid hiển thị slot lặp mỗi tuần theo weekday — status là status của series, không
  phải occurrence của tuần đang xem; lớp đã xong series vẫn hiển thị slot ở mọi tuần (không bound
  được không có ngày). Mitigation: pin diễn giải + hệ quả vào issue #56 comment ngay bước update
  issue; nếu owner muốn occurrence-per-date → cần schema change, issue riêng.
- **Edit-vs-edit là last-writer-wins (red-team fact-check)**: endpoint edit pre-read values trong
  cùng request (`kernel.ts:479-508`), client không gửi expected-old → 2 tab sửa tuần tự = edit sau
  đè edit trước im lặng, KHÔNG 409. 409-heal chỉ áp status-race (buổi đã check-in/cancel nơi
  khác). Mitigation: ghi nhận hạn chế lên issue #56; form giữ input khi fail để gõ lại.
- **Full-replace edit API wipe field** (contracts.ts:157-164 WARNING: omitted optional → "")
  → form thiếu 1 field là mất data. Mitigation: form luôn gửi đủ 5 field, init echo từ lesson;
  test mapping `kernelCommand` assert body có đủ 5 key.
- **Action name collision** `"edit-lesson"` (syllabus) — dùng `"lesson-edit"` (tên mới, hand-off
  mục (c)); test mapping riêng để tránh nhầm.
- **routeTree.gen stale sau khi thêm `validateSearch`**: file untracked, sinh bởi plugin;
  `check-types` web = `vite build && tsc --noEmit` tự regenerate — chỉ cần chạy gate bằng script
  chuẩn, không tay sửa file gen.
- **Merge-conflict với #58 đã tránh**: branch này base trên develop SAU merge #74 (verified);
  không còn vùng chồng lấn.
- **Rollback**: mọi thay đổi nằm gọn trong apps/web (5 file modify + 3 file create + 1 test flip);
  revert PR trả về grid weekday-only như PR #74 đã để — không schema/data migration, không thay đổi contract.

## Red Team Review

### Session — 2026-08-21
**Findings:** 15 (sau dedup từ 20 của 3 reviewer: Security Adversary + Assumption Destroyer + Failure Mode Analyst) — **15 accepted (5 accept-full, 10 accept-partial/mitigate), 0 rejected**
**Severity breakdown:** 2 Critical, 6 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Edit-vs-edit KHÔNG ra 409 — server pre-read trong cùng request (kernel.ts:479-508), client không gửi old-values → last-writer-wins im lặng; claim "409 optimistic-concurrency" sai cơ chế | Critical | Accept (sửa claim: 409-heal chỉ cho status-race; last-writer-wins ghi nhận lên issue) | plan.md SC/Risk, phase-04 |
| 2 | Form sửa dùng `act()` fire-and-close (lesson-modal.tsx:24-27) → mất input khi fail; heal-409 toast nói dối "đã cập nhật trước đó" cho edit-loser; trái doctrine `kernel-runtime.contract.test.ts:93-117` "close only on refreshed" | Critical | Accept (đổi sang await + close-on-refreshed-only + giữ form/input khi fail) | plan.md SC/Goals, phase-04 |
| 3 | `editing` state leak: modal always-mounted, hooks trước early-return → editing=true sống sót qua close/reopen, hiện form cho buổi completed (trả 409 loop); mitigation `key` của plan không sửa được | High | Accept (useEffect reset mirror grade-modal `:319-326` + contract assertion) | phase-04 |
| 4 | Diễn giải weekly-recurring chưa pin với issue owner; modal gắn ngày cell cho buổi completed khi xem tuần khác; series đã xong vẫn hiển thị mọi tuần | Critical→High | Accept-partial (giữ semantics — đúng với data model không cột ngày; pin diễn giải + hậu quả vào issue #56 comment; không bound tuần) | plan.md Risk, phase-05 evidence note |
| 5 | Phase 5 manual verify dùng lệnh không tồn tại (`pnpm -F web dev`, server `dev`); thực tế root `pnpm dev` (alchemy :8000) + `pnpm -F web start` (:8001) + cần `VITE_SERVER_URL`/.env | High | Accept (sửa lệnh + thêm pre-flight check stack/login/data) | phase-05 |
| 6 | Phase 3 bỏ sót describe "Wave 4" `classes.test.ts:185-265` (title pin "counts distinct (day,time) pairs, not rows" — mâu thuẫn thuật toán mới); thiếu grep blast-radius + consumers (classes/index.tsx:58,92; syllabus/$syllabusId.tsx:245) | High | Accept (phase 3 cập nhật title/comment Wave-4 + grep `sessionsDone` toàn web test + liệt kê consumers) | phase-03 |
| 7 | Max-per-enrollment đếm thiếu khi 1:2 check-in lệch (A dự 1-6, B dự 7-12 → max 6, thực 12); test plan chỉ cover nested | High→Medium | Accept-partial (giữ max — occurrence-union khả thi nhưng fragile với edit đổi day; thêm test interleaved pin lower-bound + JSDoc) | plan.md SC/Risk, phase-03 |
| 8 | Lead "N buổi" = `data.lessons.length` double-count 1:2 (24 buổi) + tính cả cancelled, mâu thuẫn invariant 7 | Medium | Accept (N = distinct `day\|time` slot của lesson chưa hủy — đúng nghĩa timetable) | plan.md SC, phase-02 |
| 9 | Param rác sống vô thời hạn trên URL khi UI hiện tuần hiện tại → URL/view desync, URL không ổn định khi share | Medium | Accept (parse null + param hiện diện → `router.navigate replace` dọn URL) | phase-02 |
| 10 | Positive locks chỉ pin nửa GHI (validateSearch/nav labels) — thiếu hop ĐỌC `useSearch`/`parseWeekParam`; không có test composition `resolveWeek` | Medium | Accept (thêm `resolveWeek(raw, now)` pure export + unit test; thêm lock `/useSearch/` + `/parseWeekParam/`) | phase-01, phase-02 |
| 11 | Phase 5 positive grep gate đòi `week-grid` trên file không được phép import nó (mock-data.ts, lesson-edit-form.tsx) → gate không chạy được đúng chữ | High | Accept (viết gate per-file tường minh) | phase-05 |
| 12 | `lesson-edit-form.tsx` trốn hệ thống lock anti-fake-date (không có negative `/08`, không nằm trong grep NEGATIVE) | Medium | Accept (thêm negative `/\/08\//` cho lesson-edit-form.tsx trong contract test + grep gate) | phase-04, phase-05 |
| 13 | `parseWeekParam` không bound năm → `?week=9999-12-31` + nav tạo expanded-year garbage `"+010000-0"` trong URL, nav chết im lặng ở biên | Medium | Accept (bound 1970–2099 trong parse + guard output addWeeks) | phase-01, plan.md SC |
| 14 | Dependency graph sai: phase 3 KHÔNG đụng lesson-modal/schedule/week-grid nhưng bị block sau phase 2 + frontmatter `dependencies: [1]` sai | Medium | Accept (phase 3 `dependencies: []`, sửa prose plan.md) | plan.md, phase-03 |
| 15 | Form thiếu coercion string→number: DOM `option`/`input number` trả string, schema đòi `z.number()` → nút Lưu khóa vĩnh viễn | Medium | Accept (state string, submit map `Number(day)/Number(dur)` trước safeParse; pin bằng mapping test) | phase-04 |

**Fact-check note (reviewer 1):** mọi cite file:line khác của plan + scout report khớp source
(2 sai số nhỏ không đáng finding: `repos/kernel.test.ts:295-453` thực tế ~461, `kernel-outcome.ts:33-40` thực tế 31-38).
Security sweep: `.strict()` contracts chống mass assignment (contracts.ts:179), `orgId` scope mọi WHERE
(kernel.ts:225/444/502) chống IDOR, `validateReturnUrl` decode 2 vòng (kernel-load-state.ts:152-163)
chống open redirect qua `?week`→returnUrl, không `dangerouslySetInnerHTML` trong apps/web.

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…phase-05 (sau khi apply 15 findings)
- Decision deltas checked: 15 (grep stale terms: heal-409/optimistic-concurrency cho edit,
  dependencies phase 3, data.lessons.length, void-run fire-and-close, pnpm -F web dev)
- Reconciled stale references: 1 (dòng evidence "heal-409 = optimistic-concurrency surface" ở
  plan.md Bối cảnh — đã correction theo finding #1; các match còn lại nằm trong bảng red-team
  hoặc context đúng)
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-08-21 (chạy trong pipeline ak:vibe tự hành, issue #56)
- **Verification Results** (per validate-workflow Step 2.5 guard — covered bởi Red Team Review
  session cùng ngày: 3 reviewer, verification roles Fact Checker + Scope Auditor + Flow Tracer,
  đã fact-check ~40 claims file:line; 2 sai số dòng không đáng finding đã ghi chú). Claims
  checked: ~40 — Verified: ~38, Failed: 2 (cả 2 là claim sai của plan — 409 mechanism + dev
  commands — đã sửa qua red-team findings #1, #5). [UNVERIFIED] tags: 0.
- **CLI format validate:** `ak plan validate` → valid:true, exit 0 (chạy sau red-team edits).
- **Decision points (tự quyết theo ràng buộc issue + hand-off, không interview vì pipeline
  tự hành — mirror precedent plan #58):**
  1. Diễn giải "buổi trong tuần" = weekly-recurring slot (không derive occurrence-date từ
     createdAt)? → **Có** — lesson không có cột ngày (`packages/db/src/schema/lesson.ts:16-44`);
     cùng semantics dashboard đang dùng (`dashboard-from-kernel.ts:7-10`); derive-from-createdAt
     fragile khi edit đổi day. Hệ quả pin lên issue #56 comment (red-team #4).
  2. Lead "N buổi" đếm gì? → **Số slot distinct chưa hủy** — đúng nghĩa timetable tuần, không
     double-count 1:2 (red-team #8).
  3. sessionsDone: max-per-enrollment hay occurrence-union? → **Max + JSDoc lower-bound** —
     occurrence-union khả thi nhưng fragile với edit đổi day (phase 4引入); pin interleaved test
     (red-team #7).
  4. Form sửa buổi trong scope #56? → **Có** — DOD M1 dòng 42 cần UI evidence cho "Sửa buổi";
     hand-off #55 mục (d) trỏ đích danh #56; PM report 2026-08-21 18:34 liệt kê "edit form echo
     đủ field" trong Cook #56.
  5. Form submit: act() fire-and-close hay await? → **Await + close-on-refreshed-only** —
     doctrine repo `kernel-runtime.contract.test.ts:93-117` (red-team #2).
- **Phases propagated:** 5 phase file đồng bộ với các quyết định trên qua red-team apply +
  consistency sweep (0 unresolved contradictions).

### Whole-Plan Consistency Sweep (sau validation)
- Files reread: plan.md + 5 phase files; grep stale terms (heal-409-for-edit, dependencies
  phase 3, `data.lessons.length`, fire-and-close, dev commands) — 0 match ngoài bảng red-team
  context đúng. Unresolved contradictions: 0.
