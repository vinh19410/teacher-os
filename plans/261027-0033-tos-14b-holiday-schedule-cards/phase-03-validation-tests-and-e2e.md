# Phase 3: Khóa kịch bản validation — test modal, test server, E2E AC-004

## Goal
Deliverable 2 của issue #453: test 35 ngày literal ở modal + server, E2E validation hộp thoại và thẻ kỳ nghỉ 3 view — tất cả xanh; xác nhận `holiday-contracts.test.ts` đã phủ không trùng lặp.

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

### Task 3.1 — Xác nhận `holiday-contracts.test.ts` đã phủ (không thêm test trùng)
- Goal: chứng minh kịch bản contract của issue đã được #445 phủ.
- Target files: `packages/api/src/holiday-contracts.test.ts` — KHÔNG sửa.
- Steps:
  1. Đọc lại test `rejects a 31-day range and accepts exactly 30 days (both ends inclusive)` và `rejects a name shorter than 2…`: schema chặn `days <= 30` nên 35 ngày bị từ chối là hệ quả trực tiếp; tên 1 ký tự đã có case "N".
  2. Ghi kết luận xác nhận này vào PR body (không thêm test lặp ý nghĩa — issue ghi "không trùng lặp").
- Success criteria: hai test nêu trên tồn tại và PASS.
- Verify: `pnpm --filter @teacher-os/api test -- holiday-contracts` exit 0 với 2 test nêu trên "passed" trong output.

### Task 3.2 — Test modal: 35 ngày → khóa nút, không preview; 30 ngày → mở khóa (TDD red→green)
- Goal: khóa đúng kịch bản AC-004 mục 2 ở tầng component.
- Target files: `apps/web/src/components/schedule/holiday-modal.test.tsx` (append test mới, giữ nguyên test 31 ngày hiện có).
- Steps:
  1. Test mới "khoảng 35 ngày → nút xác nhận khóa, không gọi preview; sửa về 30 ngày → mở khóa": điền tên hợp lệ, `from = 2026-11-01`, `to = 2026-12-05` (đúng 35 ngày tính cả hai đầu).
  2. Assert: thấy text `/tối đa 30 ngày/`; nút `Xác nhận áp dụng & Dời buổi` `.disabled === true`; sau `settle()` `repos.previewHoliday` chưa được gọi.
  3. `fireEvent.change` `holiday-to` → `2026-11-30` (30 ngày); assert nút `.disabled === false`; `await waitFor(() => expect(repos.previewHoliday).toHaveBeenCalled())`.
  4. Không sửa `holiday-modal.tsx` — nếu test đỏ thì hành vi thật lệch spec: dừng theo Failure Protocol, KHÔNG vá production code trong phase test (báo kongming).
- Success criteria: test mới PASS; test 31 ngày cũ vẫn PASS.
- Verify: `pnpm --filter web test -- holiday-modal` exit 0, output gồm test "35 ngày" "passed" và test "31 ngày" "passed".

### Task 3.3 — Test server: preview + apply 35 ngày → 400 (TDD red→green nếu thiếu)
- Goal: chứng minh server không tin client — 35 ngày bị chặn ở HTTP layer.
- Target files: `apps/server/src/routes/holidays.test.ts` (append test mới trong describe `POST /api/holidays/preview` và một assertion ở describe apply — không sửa test cũ).
- Steps:
  1. Preview: body `{ ...draft(), fromDate: <F>, toDate: addDaysISO(F, 34) }` (35 ngày từ ngày động F1 phía trước hôm nay) → `expect(res.status).toBe(400)`.
  2. Apply: cùng body + `planHash: "x"` → `expect(res.status).toBe(400)`.
  3. Nếu test đỏ: route đã chặn qua `readBody(holidayDraftSchema)` — test đỏ nghĩa là sai ngày fixture (quá khứ 422 `past-range` xảy ra trước 400?) → dùng mốc từ `vietnamTodayISO()` cộng dồn để không rơi quá khứ. Nếu vẫn đỏ → Failure Protocol.
- Success criteria: cả preview và apply trả 400 với 35 ngày.
- Verify: `pnpm --filter server test -- holidays` exit 0, test mới "passed" trong output.

### Task 3.4 — E2E: validation hộp thoại + thẻ kỳ nghỉ 3 view (AC-004)
- Goal: hai kịch bản E2E xanh trong bộ spec #447.
- Target files: `apps/e2e/specs/schedule-views-and-events.spec.ts` (append 2 test mới + cập nhật comment đầu file bỏ ghi chú "đã chuyển follow-up #453"), helpers tái dùng từ `./helpers` (`signUpViaUi`, `vietnamTodayISO`) và `./helpers-dated-class` (`seedDatedClass`).
- Steps:
  1. Test "AC-004 mục 2: hộp thoại Lịch nghỉ chung khóa validation tên + khoảng ngày": `signUpViaUi` → goto `/schedule` → click `data-testid="holiday-open"` → điền tên "N" → assert text `/Tên từ 2–100 ký tự/` + nút `Xác nhận áp dụng & Dời buổi` disabled → sửa tên hợp lệ "Nghỉ lễ E2E", `from = TODAY`, `to = TODAY + 34 ngày` (tính bằng `Date` UTC từ `vietnamTodayISO()`) → assert `/tối đa 30 ngày/` + nút disabled (không cần assert network) → sửa `to = TODAY + 29 ngày` → nút enabled và `data-testid="holiday-preview"` visible trong ~1.5s (debounce 300ms).
  2. Test "thẻ kỳ nghỉ hiển thị cả 3 view, ổn định giữa các lần tải": seed lớp `startDate = TODAY` có buổi hôm nay (như `seedTwoDistinctColorClasses`) → mở hộp thoại → điền hợp lệ, khoảng 1 ngày `TODAY..TODAY` → chờ `holiday-preview` visible → click `Xác nhận áp dụng & Dời buổi` → chờ toast/toast disappearance (modal đóng) → view Ngày `TODAY`: `page.getByTestId("holiday-calendar-card").filter({ hasText: "Nghỉ lễ E2E" })` visible → view Tuần: cùng assert trong cột `data-date="TODAY"` → view Tháng: cùng assert trong ô `.month-cell[data-date="TODAY"]` → `page.reload()` → lặp lại assert 3 view (ổn định giữa các lần tải).
  3. Nếu apply trả lỗi (422 no-sessions): kiểm seed lớp có buổi đúng `TODAY` (không đổi fixture ngày về quá khứ); nếu vẫn đỏ → Failure Protocol.
- Success criteria: 2 test mới PASS; test cũ trong file không vỡ.
- Verify: `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- schedule-views-and-events` exit 0 với cả 3 test (1 cũ + 2 mới) passed.

### Task 3.5 — Gate cuối giai đoạn 3
- Goal: bộ gate chất lượng toàn repo trước khi ship.
- Target files: không có (chạy).
- Steps: chạy `pnpm check` (biome), `pnpm check-types`, test `web` + `server` + `@teacher-os/api` các file bị đụng.
- Success criteria: tất cả sạch.
- Verify: `pnpm check && pnpm check-types && pnpm --filter web test -- schedule holiday && pnpm --filter server test -- holidays && pnpm --filter @teacher-os/api test -- holiday-contracts` exit 0.
