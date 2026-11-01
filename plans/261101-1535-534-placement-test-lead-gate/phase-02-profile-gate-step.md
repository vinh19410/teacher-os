---
phase: 2
title: "Trang test: bước form, gửi lead, đồng bộ điểm"
status: completed
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 2: Bước form thông tin trên `/kiem-tra-dau-vao/`

## Goal

Thêm bước `info` giữa `intro` và `part1`: validate client, gửi `POST /public/leads` với `source: "placement-test"`, lưu thông tin để resume, và đồng bộ điểm vào cùng lead khi nộp bài.

## Files to Create / Modify

- Create: `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` — hàm thuần và hằng số danh mục, import được từ test Node: `PLACEMENT_COURSE_GROUPS`, `PLACEMENT_STUDY_MODES`, `normalizeVietnamPhone`, `validateLeadForm(values)` ⇒ `{ ok, errors }`, `buildLeadPayload({ lead, placement, elapsedMs, website })`, `leadErrorMessage(status, body)`.
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.js`
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.css`
- Modify: `apps/profile/public/kiem-tra-dau-vao/index.html` (chỉ nếu cần meta/landmark; giữ `<meta name="lead-api">`)
- Modify: `apps/profile/tests/placement-test.test.mjs`
- Modify: `apps/server/src/lead-catalog-drift.test.ts` (đọc thêm `kiem-tra-dau-vao/lead-gate.js`/`test.js` để đối chiếu danh mục khóa học và hình thức lớp)

## Tasks & Steps

<!-- Updated: Red Team & Validation Session 1 - elapsedMs backdate, submitCount check, keepalive score sync, shared-PC clearAttempt, details.open, catalog exports, and advice handover structure -->

### Task 2.1 — Tạo `lead-gate.js` và viết/chạy unit test + catalog drift test
- **Goal:** Có module thuần `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` chứa danh mục khóa học/hình thức lớp, validate form, tạo payload `POST /public/leads`, thông báo lỗi tiếng Việt, kèm unit test và drift test.
- **Target files and symbols:**
  - `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` (`PLACEMENT_COURSE_GROUPS`, `PLACEMENT_STUDY_MODES`, `normalizeVietnamPhone`, `validateLeadForm`, `buildLeadPayload`, `leadErrorMessage`)
  - `apps/profile/tests/placement-test.test.mjs`
  - `apps/server/src/lead-catalog-drift.test.ts`
- **Steps:**
  1. Viết test trước trong `apps/profile/tests/placement-test.test.mjs` và `apps/server/src/lead-catalog-drift.test.ts`:
     - `validateLeadForm`: thiếu từng trường bắt buộc (`name`, `email`, `phone`), email sai định dạng, SĐT `84…`/`+84…` hợp lệ, SĐT 9 số sai, tên 1 ký tự sai, ngày sinh sai lịch (`2026-02-30`)/năm `< 1940`/năm tương lai (`> currentYear` theo giờ VN), `note` quá 500 ký tự.
     - `buildLeadPayload`: luôn có `source: "placement-test"`, chuẩn hoá `phone`, ép `elapsedMs >= 0` (và khi `isScoreSync: true` hoặc đã đăng ký thì `elapsedMs >= 3500`), bỏ trường tuỳ chọn rỗng, cắt `placement` ≤ `LEAD_PLACEMENT_MAX` (300), giữ đủ trường của `lead` khi đồng bộ điểm.
     - `leadErrorMessage`: map đúng thông báo tiếng Việt cho `400`, `429`, `403/503/5xx` và lỗi mạng.
     - Drift test trong `apps/server/src/lead-catalog-drift.test.ts`: import `PLACEMENT_COURSE_GROUPS` và `PLACEMENT_STUDY_MODES` từ `lead-gate.js`, kiểm khớp 100% với `LEAD_COURSE_GROUPS`, `LEAD_COURSES`, `LEAD_COURSE_LABELS`, `LEAD_STUDY_MODES`, `LEAD_STUDY_MODE_LABELS`.
  2. Tạo `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` thỏa mãn toàn bộ test trên.
- **Success criteria:** Unit test của `profile` và drift test của `server` chạy xanh.
- **Verify:** `pnpm --filter profile test && pnpm --filter server test -- lead-catalog-drift` thoát mã 0.

### Task 2.2 — Tích hợp bước `info`, gửi lead, đồng bộ điểm ngầm và "Đổi thông tin" trong `test.js` + `test.css`
- **Goal:** Trang `/kiem-tra-dau-vao/` hiển thị bước `info` (2/5) giữa `intro` và `part1`, gửi lead trước khi vào Phần 1, đồng bộ điểm ở màn kết quả, và hỗ trợ đổi thông tin/làm lại an toàn trên máy dùng chung.
- **Target files and symbols:**
  - `apps/profile/public/kiem-tra-dau-vao/test.js` (`VALID_STEPS`, `loadSavedAttempt`, `saveAttempt`, `clearAttempt`, `createStepperBar`, `renderIntroStep`, `renderInfoStep`, `renderPart1Step`, `renderPart2Step`, `renderResultStep`)
  - `apps/profile/public/kiem-tra-dau-vao/test.css`
- **Steps:**
  1. **State & `pageLoadedAt`:** Thêm `"info"` vào `VALID_STEPS`; thêm `lead` (`{ name, phone, email, birthDate, course, studyMode, note, registered: boolean, syncedPlacement: string }`) vào `loadSavedAttempt`/`saveAttempt`/`clearAttempt`. Khi `parsed.version !== test.version`, vẫn giữ `parsed.lead` hợp lệ (đặt `syncedPlacement = ""`) để không bắt học viên nhập lại khi giáo viên vừa phát hành đề mới. Nếu `loadSavedAttempt` khôi phục `lead` đã có hoặc `step !== "intro"`, lùi `pageLoadedAt = Math.min(pageLoadedAt, Date.now() - 3500)` để tránh bẫy honeypot `elapsedMs < 3000` sau khi reload. Nếu `step` là `part1`/`part2`/`result` mà `!lead?.registered` ⇒ đưa `step` về `"info"`.
  2. **Stepper (1–5):** Thêm pill `"2. Thông tin của bạn"`; đánh số lại `1. Giới thiệu`, `2. Thông tin của bạn`, `3. Phần 1: Vocab + Grammar`, `4. Phần 2: Listening`, `5. Kết quả & Lộ trình`.
  3. **Intro:** Đổi câu `"Bạn không cần đăng nhập hay điền thông tin cá nhân trước khi làm bài."` thành `"Bạn chỉ cần để lại họ tên, email và số điện thoại trước khi bắt đầu để nhận kết quả CEFR và lộ trình học cá nhân hóa."`. Nút `#startTestBtn` và `#resumeAttemptBtn` chuyển sang `state.lead?.registered ? "part1" : "info"`.
  4. **Form (`renderInfoStep`):** Dựng bằng `createEl` (không `innerHTML`). Trường bắt buộc: Họ và tên (`#leadName`, `name="name"`, `autocomplete="name"`, `required`, `aria-required="true"`), Email (`#leadEmail`, `name="email"`, `type="email"`, `autocomplete="email"`, `required`, `aria-required="true"`), Số điện thoại Zalo (`#leadPhone`, `name="phone"`, `type="tel"`, `inputmode="tel"`, `autocomplete="tel"`, `required`, `aria-required="true"`). Trường tuỳ chọn trong `<details id="leadOptionalDetails">` (`"Thông tin thêm (không bắt buộc)"`): ngày sinh (`#leadBirthDate`, `type="date"`, `min="1940-01-01"`), khóa học (`#leadCourse`, `<select name="course">` dựng từ `PLACEMENT_COURSE_GROUPS`), hình thức lớp (`#leadStudyMode`, `<select name="studyMode">` dựng từ `PLACEMENT_STUDY_MODES`), ghi chú (`#leadNote`, `<textarea name="note" maxlength="500">`). Honeypot `website` ẩn (`tabindex="-1"`, `aria-hidden="true"`). Lỗi từng trường hiện dưới ô với `aria-invalid` + `aria-describedby`; nếu trường lỗi nằm trong `<details>`, đặt `details.open = true` trước khi `.focus()` ô lỗi đầu tiên; validate khi `blur` và `submit`.
  5. **Gửi lead ở bước `info`:** Gọi `POST ${apiBase}/public/leads` với `AbortController` 10 giây, khoá nút gửi + `aria-busy="true"`.
     - `201/200` (và `typeof body?.submitCount === "number"` hoặc thành công hợp lệ): đặt `lead.registered = true`, lưu `saveAttempt(state)` đồng thời đồng bộ thông tin sang `localStorage` khoá `msmy_lead_draft_v1` (để khi bấm `#registerWithResultBtn` sang trang chủ form tư vấn có sẵn thông tin), rồi `rerender("part1")`.
     - `400`: map `fields` sang lỗi từng trường (mở `<details>` nếu trường lỗi nằm bên trong) và focus trường đầu tiên; nếu `fields` rỗng/không khớp trường nào thì hiện hộp lỗi form.
     - `429`: hiện thông báo `"Có quá nhiều lượt đăng ký từ mạng này. Vui lòng thử lại sau ít phút hoặc nhắn Zalo cô Mỹ."` kèm nút Thử lại + link Zalo.
     - `403/503/5xx/lỗi mạng`: hiện `"Hệ thống đang bận, chưa thể lưu thông tin của bạn."` kèm nút Thử lại + link Zalo; **không** cho vào Phần 1.
  6. **Đồng bộ điểm ở `renderResultStep`:** Nếu `state.lead?.registered && state.lead.syncedPlacement !== summaryText`, gửi nền `POST ${apiBase}/public/leads` (`keepalive: true`, `elapsedMs: Math.max(3500, Date.now() - pageLoadedAt)`) kèm toàn bộ trường của `state.lead` + `placement: summaryText` + `source: "placement-test"`. Khi trả về `200/201` (và `state.lead` chưa bị reset/đổi), gán `state.lead.syncedPlacement = summaryText` và `saveAttempt(state)`. Lỗi bất kỳ ⇒ nuốt, không chặn UI.
  7. **Làm lại & Đổi thông tin:** `"Làm Lại"` (`#retryTestBtn`) và `"Làm Lại Từ Đầu"` (`#resetAttemptBtn`) gọi `clearAttempt(test, { keepLead: true, currentLead: state.lead })` (giữ `lead`, đặt `syncedPlacement = ""`) và gán lại đầy đủ `state.lead = fresh.lead`. Hiển thị thanh thông tin học viên kèm nút/liên kết `"Không phải bạn? Đổi thông tin"` (`#changeLeadInfoBtn`) ở `intro` (khi `lead?.registered`), `part1`, `part2`, và `result`: khi bấm sẽ gọi `clearAttempt(test, { keepLead: false })`, xoá cả `msmy_lead_draft_v1`, gán `state.lead = null`, và `rerender("info")`.
  8. **CSS (`test.css`):** Bổ sung `select:focus-visible, textarea:focus-visible, summary:focus-visible` vào rule focus ring; thêm style cho `.info-form-grid`, `.field`, `.input-control`, `.field-error`, `.optional-details`, `.lead-identity-bar`, `.gate-error-alert`; đảm bảo touch target ≥ 44px và không tràn ngang ở 375px.
- **Success criteria:** Unit test, drift test và biome check đều xanh.
- **Verify:** `pnpm --filter profile test && pnpm --filter server test -- lead-catalog-drift && pnpm exec biome check apps/profile apps/server` thoát mã 0.

## Verification

- `pnpm --filter profile test`
- `pnpm --filter server test -- lead-catalog-drift`
- `pnpm exec biome check apps/profile apps/server`

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.

## Risk / Rollback

- Dedupe ghi đè trường tuỳ chọn ⇒ luôn gửi đủ bộ trường ở lần đồng bộ điểm (đã có test).
- Lưu PII trong `localStorage` ⇒ có "Đổi thông tin" xoá; không đưa PII vào URL.
- Rollback: revert commit; bản lưu `localStorage` có `lead` dư vẫn đọc được vì loader bỏ qua khoá lạ.
