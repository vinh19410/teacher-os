---
phase: 2
title: "Trang test: bước form, gửi lead, đồng bộ điểm"
status: pending
priority: P2
effort: "4h"
dependencies: [1]
---

# Phase 2: Bước form thông tin trên `/kiem-tra-dau-vao/`

## Goal

Thêm bước `info` giữa `intro` và `part1`: validate client, gửi `POST /public/leads` với `source: "placement-test"`, lưu thông tin để resume, và đồng bộ điểm vào cùng lead khi nộp bài.

## Files to Create / Modify

- Create: `apps/profile/public/kiem-tra-dau-vao/lead-gate.js` — hàm thuần, import được từ test Node: `normalizeVietnamPhone`, `validateLeadForm(values)` ⇒ `{ ok, errors }`, `buildLeadPayload({ lead, placement, elapsedMs, website })`, `leadErrorMessage(status, body)`.
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.js`
- Modify: `apps/profile/public/kiem-tra-dau-vao/test.css`
- Modify: `apps/profile/public/kiem-tra-dau-vao/index.html` (chỉ nếu cần meta/landmark; giữ `<meta name="lead-api">`)
- Modify: `apps/profile/tests/placement-test.test.mjs`
- Modify: `apps/server/src/lead-catalog-drift.test.ts` (đọc thêm `kiem-tra-dau-vao/lead-gate.js`/`test.js` để đối chiếu danh mục khóa học và hình thức lớp)

## Tasks & Steps

1. **State**: thêm `"info"` vào `VALID_STEPS`; thêm `lead` (`{ name, phone, email, birthDate, course, studyMode, note, registered: boolean, syncedPlacement: string }`) vào trạng thái lưu của `saveAttempt/loadSavedAttempt/clearAttempt`. Giữ `version` khoá hiện tại; bản lưu cũ thiếu `lead` đọc ra `lead = null`. Nếu `step` là `part1/part2/result` mà `lead?.registered` không đúng ⇒ đưa về `info`.
2. **Stepper**: thêm pill "Thông tin" (bước 2); đánh số lại 1–5.
3. **Intro**: sửa câu "Bạn không cần đăng nhập hay điền thông tin cá nhân trước khi làm bài" thành nội dung đúng mới ("Bạn chỉ cần để lại họ tên, email và số điện thoại trước khi bắt đầu"). Nút "Bắt đầu" và "Tiếp tục bài đang làm" đi tới `info` nếu chưa `registered`, ngược lại `part1`.
4. **Form (`renderInfoStep`)**: dựng bằng `createEl` (không `innerHTML`). Trường bắt buộc có dấu `*`, `required`, `aria-required`, `autocomplete` (`name`, `email`, `tel`), `inputmode`; trường tuỳ chọn trong `<details>` "Thông tin thêm (không bắt buộc)": ngày sinh (`type=date`, `min=1940-01-01`), khóa học (`<select>` cùng danh mục/nhóm `optgroup` như `profile/public/index.html`), hình thức lớp, ghi chú (`maxlength=500`). Honeypot `website` ẩn (`tabindex=-1`, `aria-hidden`). Lỗi từng trường hiện dưới ô, `aria-invalid` + `aria-describedby`, focus ô lỗi đầu tiên khi submit; validate khi `blur`.
5. **Gửi lead**: `fetch(`${apiBase}/public/leads`, { method: "POST", ... })` với `AbortController` 10 giây, `elapsedMs = Date.now() - pageLoadedAt` (tính từ lúc tải trang, không phải lúc hiện form). Lý do: server trả **201 giả và không ghi DB** khi `elapsedMs < 3000`; nếu đo từ lúc hiện form thì trình duyệt autofill + bấm gửi nhanh sẽ khiến học viên tưởng đã đăng ký mà lead không được lưu. Người dùng luôn đã ở trang ≥ 3 giây (tải đề, đọc intro) trước khi tới form; thêm test đơn vị cho `buildLeadPayload` chứng minh `elapsedMs` không bao giờ nhỏ hơn thời gian từ lúc tải trang.
   - `201/200` ⇒ `lead.registered = true`, `saveAttempt`, `rerender("part1")`.
   - `400` ⇒ map `fields` ⇒ lỗi từng trường, không echo giá trị.
   - `429` ⇒ "Có quá nhiều lượt đăng ký từ mạng này. Vui lòng thử lại sau ít phút hoặc nhắn Zalo cô Mỹ." (`Retry-After` nếu có).
   - `403/503/5xx/lỗi mạng` ⇒ "Hệ thống đang bận" + nút Thử lại + link Zalo; **không** cho vào Phần 1.
   - Khoá nút gửi và `aria-busy` khi đang gửi (chống bấm đúp).
6. **Đồng bộ điểm** trong `renderResultStep`: nếu `lead.registered` và `lead.syncedPlacement !== summaryText`, gửi nền `POST /public/leads` với **toàn bộ** trường của form + `placement: summaryText` + `source: "placement-test"` (dedupe ghi đè nên phải gửi đủ). Thành công ⇒ `lead.syncedPlacement = summaryText` + `saveAttempt`. Lỗi bất kỳ ⇒ nuốt, không đổi UI, cho thử lại ở lần render kết quả sau.
7. **Làm lại / Đổi thông tin**: "Làm Lại" giữ `lead` (`clearAttempt(test, { keepLead: true })`) và đặt `syncedPlacement = ""`; thêm liên kết "Không phải bạn? Đổi thông tin" ở intro và đầu Phần 1 để xoá `lead` và về `info`. Khi `clearAttempt` thông thường ("Làm lại từ đầu" ở banner resume) cũng giữ `lead`.
8. **CSS**: thêm style cho form, lỗi, `details`; tái dùng token trong `test.css`; mục tiêu chạm ≥ 44px, không tràn ngang ở 375px.
9. **Test (viết trước)** trong `apps/profile/tests/placement-test.test.mjs` + `lead-gate.js`:
   - `validateLeadForm`: thiếu từng trường bắt buộc, email sai, SĐT `84…`/`+84…` hợp lệ, SĐT 9 số sai, tên 1 ký tự sai, ngày sinh tương lai sai, `note` quá 500.
   - `buildLeadPayload`: luôn có `source`, bỏ trường rỗng, chuỗi `placement` ≤ `LEAD_PLACEMENT_MAX`, kèm đủ trường khi đồng bộ điểm.
   - `leadErrorMessage`: map 400/429/503/mạng.
   - Drift: `<select>` khóa học/hình thức lớp trong trang test khớp `LEAD_COURSES`/`LEAD_STUDY_MODES` (mở rộng `lead-catalog-drift.test.ts`).

## Verification

- `pnpm --filter profile test`
- `pnpm --filter server test -- lead-catalog-drift`
- `pnpm exec biome check apps/profile apps/server`
- Chạy tay `PORT=8105 LEAD_API_URL=http://localhost:8100 node apps/profile/serve.mjs` (chỉ khi cổng trống; tắt tiến trình sau khi xong), duyệt 3 viewport + bàn phím theo `REVIEW.md`.

## Risk / Rollback

- Dedupe ghi đè trường tuỳ chọn ⇒ luôn gửi đủ bộ trường ở lần đồng bộ điểm (đã có test).
- Lưu PII trong `localStorage` ⇒ có "Đổi thông tin" xoá; không đưa PII vào URL.
- Rollback: revert commit; bản lưu `localStorage` có `lead` dư vẫn đọc được vì loader bỏ qua khoá lạ.
