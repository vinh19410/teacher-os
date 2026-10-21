---
phase: 1
title: "App: data-testid cho link mở modal điểm danh (TDD red → green)"
goal: "Link mở attendance modal trong class-sessions-section có data-testid ổn định theo index buổi, được pin bởi test regression."
---

# Phase 01 — App: data-testid cho link mở modal điểm danh

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

## Files to Create or Modify

- `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx` (modify) — thêm 1 test
  trong describe `group class — attendance roster`.
- `apps/web/src/components/class-detail/class-sessions-section.tsx` (modify) — thêm
  `data-testid` vào button link mở modal (khối `{(status === "completed" || dateArrived) &&
  isGroupSession && (<button … onClick={() => setModalIndex(s.index)}>`).

## Tasks & Steps

### Task 1.1 — Test regression RED cho testid
- Goal: test mới fail vì `session-attendance-open-1` chưa tồn tại (red phase của TDD).
- Target files: `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`.
- Steps:
  1. Trong describe `group class — attendance roster`, thêm test mới sau test hiện có:
     dùng `server = startKernelServer(mondayClass(["st-1", "st-2"]))` + `await openSessionsTab()`.
  2. Assert `within(sessionRow(<NHÃN NGÀY HÔM NAY TRONG FIXTURE>)).getByTestId("session-attendance-open-1")`
     tồn tại trong DOM (fixture `mondayClass` tạo 2 buổi: `TODAY` = index 1, `NEXT_WEEK`
     = index 2; buổi today có `dateArrived` → link render với 2 học viên).
  3. `fireEvent.click` vào testid đó rồi assert `screen.getByRole("dialog")` xuất hiện
     (modal điểm danh mở).
- Success criteria: test compile và chạy, thất bại đúng tại assertion `getByTestId`.
- Verify: `pnpm --filter web exec vitest run src/routes/_auth/classes/\$classId.sessions.test.tsx -t "attendance"` —
  **kỳ vọng exit ≠ 0 với lỗi `Unable to find…data-testid…session-attendance-open-1`**.
  Đây là red phase chủ ý: test pass ở bước này là TÍN HIỆU LỖI (test không pin được gì).

### Task 1.2 — Thêm data-testid vào link mở modal (GREEN)
- Goal: link mở modal mang `data-testid="session-attendance-open-{index}"`; test 1.1 pass.
- Target files: `apps/web/src/components/class-detail/class-sessions-section.tsx`
  (button `onClick={() => setModalIndex(s.index)}`, className có `underline-offset-4`).
- Steps:
  1. Thêm prop `data-testid={`session-attendance-open-${s.index}`}` vào button đó
     (một dòng, không đổi gì khác — text, class, onClick giữ nguyên).
- Success criteria: test 1.1 pass; không test nào khác trong file fail.
- Verify: `pnpm --filter web exec vitest run src/routes/_auth/classes/\$classId.sessions.test.tsx` —
  kỳ vọng **exit 0**, output có `Test Files 1 passed`.

### Task 1.3 — Gate chất lượng workspace
- Goal: không phá lint/types toàn workspace.
- Steps: chạy 2 lệnh gate dưới; nếu lỗi do thay đổi của phase này → sửa; nếu lỗi có sẵn
  trên nhánh → ghi nhận vào plan.md mục Validation Log và dừng theo Failure Protocol.
- Verify: `pnpm check` exit 0 **và** `pnpm check-types` exit 0.

## Verification matrix (tổng phase)

| Bước | Lệnh | Kỳ vọng |
|---|---|---|
| Red | `pnpm --filter web exec vitest run src/routes/_auth/classes/\$classId.sessions.test.tsx -t "attendance"` | exit ≠ 0, thiếu `session-attendance-open-1` |
| Green | `pnpm --filter web exec vitest run src/routes/_auth/classes/\$classId.sessions.test.tsx` | exit 0 |
| Gate | `pnpm check && pnpm check-types` | exit 0 |
