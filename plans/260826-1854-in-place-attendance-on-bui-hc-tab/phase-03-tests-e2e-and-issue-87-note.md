---
phase: 3
title: "Tests, e2e, ghi chú issue #87"
status: pending
priority: P2
effort: 0.5d
dependencies: [2]
---

# Phase 3: Tests, e2e, ghi chú issue #87

## Overview

Khóa hợp đồng runtime + e2e: CTA sống trên tab Buổi học; count Badge "Sắp tới" của lớp start-tomorrow **không** vỡ. Comment GitHub issue #87: status dropdown / fan-out **SUPERSEDED** bởi plan này.

## Requirements

- Functional:
  - Giữ test hiện tại `class-operations.spec.ts:18-82` (create-class UI start **tomorrow** → 12 "Sắp tới"; check-in trên `/schedule`; reload → 1 "Đã học" + 11 "Sắp tới"). Future sessions = Badge, không CTA → count không đổi.
  - Thêm 1 e2e (cùng file hoặc `test(...)` thứ hai): sau `signUpViaUi`, tạo lớp `startDate` ≤ hôm nay VN qua `POST /api/classes` (schema không future-only — `classCreateSchema.startDate` `z.string()`, `contracts.ts:59`; chỉ UI `add-class-modal.tsx:53-104` chặn). Thêm học viên → tab Buổi học → `getByRole("button", { name: "Điểm danh" })` visible trên sequential head → click → toast/text "Đã điểm danh." → row đó thành "Đã học"; các buổi tương lai vẫn "Sắp tới".
  - `kernel-runtime.contract.test.ts` test `"direct actions await the outcome..."` (`:253-276`): thêm đọc `class-schedule-table.tsx` (+ modal nếu có `void run`). Assert `useDirectKernelAction` **không** xuất hiện trong 2 file đó (hook ở route). Assert `void run(` + `disabled={busy || isPending(` trên table. Route vẫn assert notes `isPending("class-notes")`.
  - Comment GitHub issue **87** (`vinh19410/teacher-os`): dropdown Upcoming/Completed/Cancelled + fan-out `session.rows` bị plan `260826-1854-in-place-attendance-on-bui-hc-tab` thay thế. Không implement dropdown. Không đóng issue trừ khi user yêu cầu.
- Non-functional:
  - Không sửa `data-actions.ts`, `apps/server/src/kernel.test.ts`, reducer tests.
  - Không e2e "Điểm danh tất cả". Không e2e cancel-lesson trên tab này.
  - POST `/api/classes` từ Playwright phải gửi cookie session + `Origin` đúng host + `Content-Type: application/json` (CSRF `kernel.ts:110-116`). Dùng `page.request.post(url, { data, headers })` trên cùng origin sau login — cookie đi kèm.

## Architecture

### Vì sao test cũ vẫn xanh

`add-class-modal.tsx:53-54` default + min = tomorrow. Pin Playwright `use.timezoneId: "Asia/Ho_Chi_Minh"` trong `apps/e2e/playwright.config.ts` để tomorrow-local === tomorrow-VN. Assert thêm `getByRole("button", { name: "Điểm danh" }).toHaveCount(0)` trên tab Buổi học của lớp start-tomorrow. Check-in `/schedule` không date-gate → prefix sơn buổi 1 "Đã học", 11 Badge còn lại.

Cấm "ghi chú rồi để đỏ" nếu count 12 lệch TZ.


### E2E CTA — tạo lớp hôm nay qua API :8000

UI không cho chọn hôm nay. Playwright `baseURL` = `http://localhost:8001` (Vite, không proxy — `apps/e2e/playwright.config.ts:15`). API = `http://localhost:8000`, `CORS_ORIGIN` = `http://localhost:8001` (`apps/e2e/src/boot.ts:19-23`). `page.request.post("/api/classes")` đập vào :8001 → 404.

Đúng:

```
page.request.post("http://localhost:8000/api/classes", {
  data: {
    name, type: "ielts", level, skills: ["Writing"],
    mode: "Online", templateId: "",
    schedule: { days: [vnTodayMon0], start: "19:00", end: "20:30" },
    sessionsTotal: 12,
    startDate: vietnamTodayISO,
  },
  headers: {
    Origin: "http://localhost:8001",
    "Content-Type": "application/json",
  },
})
```

- `skills: ["Writing"]` — `z.enum(IELTS_SKILLS)` (`contracts.ts:23-41`); `"writing"` → 400.
- `days: [vnTodayMon0]` bắt buộc. Công thức: parse `vietnamTodayISO` → `new Date(`${iso}T00:00:00Z`)` → `(getUTCDay() + 6) % 7`. Cấm `Date#getDay()`. Export helper `vietnamTodayISO` + `vnWeekdayMon0` trong `apps/e2e/specs/helpers.ts`.
- `startDate` = `vietnamTodayISO`. Không `toISOString().slice(0,10)`.
- Cookie localhost đi với `page.request` sau `signUpViaUi`. Không `request` fixture tách context.
- Sau POST: **chỉ** `page.reload()` rồi mới mở `/classes`. Cấm `goto /classes` như heal (`['kernel']` `staleTime: Infinity` — SPA reuse cache).
- Lessons sinh lúc thêm HV (`POST /api/students` + `classId`), không lúc POST class. Seed: POST class → reload → add student → đợi tên → tab Buổi học.


Toast: `getByText("Đã điểm danh.")`. Completion: `getByText("Đã học", { exact: true })` count ≥ 1 trên tab Buổi học.

Không click "Điểm danh" trên `/schedule` trong test mới.

### Issue #87 comment (gợi ý body)

```
Issue #87 gồm 2 phần. Plan attendance chỉ thay PHẦN DROPDOWN:

- Status dropdown + fan-out `session.rows` → superseded bởi
  plans/260826-1854-in-place-attendance-on-bui-hc-tab
  (CTA tuần tự 1 enrollmentLessonId / 1 sid / 1 click).
- Inline-edit topic vẫn thuộc #87 / merge-tabs phase 3. Không đóng issue.
```

`gh issue view 87` trước: title phải chứa "inline edit". Không `--close`.



## Related Code Files

- Modify: `apps/e2e/specs/class-operations.spec.ts` — thêm test CTA; giữ test 12 Sắp tới + assert 0 button trên tab.
- Modify: `apps/e2e/playwright.config.ts` — `timezoneId: "Asia/Ho_Chi_Minh"`.
- Modify: `apps/e2e/specs/helpers.ts` — `vietnamTodayISO` + `vnWeekdayMon0` (UTC-from-ISO).
- Modify: `apps/web/src/lib/kernel-runtime.contract.test.ts` — assert table/modal wiring.
- GitHub: issue 87 comment (không đóng; không sửa file merge-tabs).


Không create kernel endpoint. Không sửa contract test line-count trừ khi P2 làm gãy (sửa tối thiểu).

## Implementation Steps

1. Pin `timezoneId: "Asia/Ho_Chi_Minh"` trong `playwright.config.ts`. Chạy test cũ: 12 "Sắp tới" + 0 button "Điểm danh" trên tab. Fail vì CTA trên lớp tomorrow → bug P2 date gate, không nới count.
2. Helper `vietnamTodayISO` + `vnWeekdayMon0` trong `helpers.ts` (công thức UTC-from-ISO). `signUpViaUi`. `page.request.post("http://localhost:8000/api/classes", { data: { name, type: "ielts", skills: ["Writing"], schedule: { days: [vnWeekdayMon0], start: "19:00", end: "20:30" }, sessionsTotal: 12, startDate: vietnamTodayISO, mode: "Online", templateId: "", level: "" }, headers: { Origin: "http://localhost:8001", "Content-Type": "application/json" } })`. Assert `status === 201` (403 = Origin; 401 = cookie; 415 = content-type). **Chỉ** `page.reload()`. Cấm `goto /classes` như heal. Cấm relative `/api/classes`.
3. Mở lớp (tên unique), `+ Thêm học viên`, đợi tên HV hiện (lessons sinh lúc add-student), rồi tab Buổi học.
4. `getByRole("button", { name: "Điểm danh" })` count 1. Click. Chờ Badge "Đã học" count 1 (toast "Đã điểm danh." nếu không 409). `page.reload()` — Badge vẫn 1 (persist). Button count 0 nếu buổi kế future.
5. `kernel-runtime.contract.test.ts`: table/modal `void run(` + `disabled={busy || isPending(`; **không** `useDirectKernelAction()`; **không** `info.lessonId` cạnh `run(`.
6. `gh issue view 87` — title chứa "inline edit". Comment tách dropdown vs inline-edit. Không `--close`.
7. Không chạy formatter/linter toàn repo trừ khi cook yêu cầu.


## Success Criteria

- [x] E2E cũ: timezone VN; 12 "Sắp tới"; 0 button Điểm danh trên tab; `/schedule` check-in → 1 "Đã học" + 11 "Sắp tới".
- [x] E2E mới: CTA trên Buổi học, 1 click, persist sau `page.reload()`.
- [x] E2E mới không đụng `/schedule` lesson-modal.
- [x] Contract runtime khóa table/modal dùng `run` props, không hook riêng, không syllabus id.
- [x] Issue #87 comment tách dropdown superseded / inline-edit còn sống.
- [x] Không test / code path "Điểm danh tất cả", mark-absent, cancel trên tab.

## Risk Assessment

| Risk | Signal | Response |
|------|--------|----------|
| E2E cũ vỡ vì CTA thay Badge | `toHaveCount(12)` fail | Pin timezone VN + assert 0 button; đừng nới 12 |
| POST class 404/403/401/415 | `status !== 201` | :8000 + Origin :8001; 403=Origin, 401=cookie, 415=content-type |
| `vnWeekdayMon0` lấy `getDay()` máy | 0 CTA | Helper UTC-from-ISO; cấm `Date#getDay` |
| `goto /classes` sau POST | Lớp không thấy | Chỉ `page.reload()` |
| Comment nuốt inline-edit | Close #87 nhầm | Template tách 2 phần; không `--close` |
| Contract quá chặt `isPending(lessonId)` | Source-parse fail | Match lỏng `disabled=\{busy \|\| isPending\(` |

Assumption "server nhận startDate hôm nay": `classCreateSchema` không future-check. Nếu sau này server thêm guard — e2e CTA phải chuyển sang clock-mock / seed; **không** nới UI create-class trong slice này.

## Next Steps

Cook xong P3 → merge-tabs phase 3 phải xóa dropdown/fan-out khỏi scope trước khi implement. Plan này `blocks: [260826-1611-merge-class-detail-schedule-and-curriculum-tabs]`.
