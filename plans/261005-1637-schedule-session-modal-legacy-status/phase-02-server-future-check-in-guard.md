---
phase: 2
title: "Server chặn check-in buổi tương lai"
status: pending
effort: "0.25d"
---

# Phase 2 — Server chặn check-in buổi tương lai

## Context

- `apps/server/src/routes/kernel.ts:1141-1190` — `lessonStatusAction` (check-in/cancel theo lesson id): chỉ kiểm tra `status === "upcoming"`.
- `apps/server/src/routes/kernel.ts:1429` — `POST /classes/:id/sessions/:date/check-in` → `occurrenceStatusAction`.
- `vietnamTodayISO` đã import ở `kernel.ts:33` (đang dùng cho due date bài tập).
- Client: `apps/web/src/lib/kernel-outcome.ts` — 409 bị map thành "Dữ liệu đã được cập nhật trước đó…" → **không** dùng 409 cho lỗi này.

## Requirements

1. Chỉ áp dụng cho **check-in** (`nextStatus === "completed"`); cancel và edit buổi tương lai vẫn cho phép.
2. `/lessons/:id/check-in`: nếu `row.date !== null && row.date > today` → `422 { error: "session is in the future", reason: "future-session" }`. Row undated không có ngày để so → cho qua (UI phase 1 đã chặn).
3. `/classes/:id/sessions/:date/check-in`: nếu `dateISO > today` → cùng response 422, kiểm tra trước khi ghi.
4. "Hôm nay" lấy qua clock inject được (vd `deps.todayISO ?? vietnamTodayISO`) để test server với ngày cố định 2026-08/09 ổn định.
5. Client: `kernel-outcome.ts` map `422` + `reason: "future-session"` → toast lỗi "Chưa tới ngày học — chưa thể điểm danh." (`reconcile: "none"`). Nếu outcome hiện không mang `reason`, đọc body theo cách các mapping `reason` khác trong repo đang làm.

## Files

- Modify: `apps/server/src/routes/kernel.ts`, `apps/web/src/lib/kernel-outcome.ts` (+ nơi khởi tạo deps của kernel nếu thêm clock)
- Tests: `apps/server/src/kernel.test.ts`, `apps/server/src/kernel-occurrence.test.ts`, test của `kernel-outcome` (nếu có)

## Steps

1. Test server (viết trước):
   - Dated lesson `date = today + 1` → check-in 422 `future-session`, DB vẫn `upcoming`.
   - Dated lesson `date = today` → 200.
   - Undated lesson → 200 (giữ hành vi).
   - Cancel lesson tương lai → 200.
   - Occurrence check-in `:date = today + 1` → 422; `:date = today` → 200.
2. Implement guard + clock inject.
3. Mapping toast client + test.
4. `pnpm --filter server test`, `pnpm --filter web test`, `pnpm check-types`.

## Validation

- Toàn bộ test server cũ xanh (không có test nào check-in buổi tương lai so với clock inject).
- E2E `class-operations` (seed `startDate = today`) vẫn check-in được.

## Risks

- Lệch múi giờ: so sánh chuỗi `yyyy-mm-dd` theo giờ VN, đồng nhất với `sessionIsEligibleDate` phía web.
- Client cũ (tab đang mở trước deploy) bấm Điểm danh buổi tương lai → nhận toast lỗi chung; chấp nhận.
