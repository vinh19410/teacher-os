---
phase: 1
title: "Chuẩn hóa canonicalJson và viết Unit Test"
status: ready
priority: P1
effort: "20m"
dependencies: []
---

# Phase 1: Chuẩn hóa canonicalJson và viết Unit Test

## Goal

Chuẩn hóa hàm `canonicalJson` để loại bỏ các key có giá trị `undefined` hoặc `null` trong object entries, giúp biểu diễn JSON có tính chính tắc đối với các trường schema dạng `.nullish()`. Tạo bộ unit test cho `canonicalJson` bao phủ toàn bộ các trường hợp biên.

## Target files and symbols

- `apps/web/src/lib/canonical-json.ts` (hàm `canonicalJson`)
- `apps/web/src/lib/canonical-json.test.ts` (tệp mới)

## Tasks & Steps

### Task 1.1 — Sửa logic lọc object entries trong `canonicalJson`
- **Goal**: Bỏ qua các key có giá trị `null` hoặc `undefined` trong object, cập nhật tài liệu giải thích.
- **Target files and symbols**: `apps/web/src/lib/canonical-json.ts` (symbol `canonicalJson`).
- **Steps**:
  1. Trong `apps/web/src/lib/canonical-json.ts`, cập nhật điều kiện lọc của `Object.entries`:
     thay `.filter(([, item]) => item !== undefined)` bằng `.filter(([, item]) => item !== undefined && item !== null)`.
  2. Cập nhật JSDoc comment giải thích lý do bỏ qua cả `null` và `undefined` (do các trường question schema dùng `.nullish()`, trong khi server snapshot `parseQuestions` luôn trả về `null`).
- **Verify**: `pnpm --filter web exec vitest run src/lib/canonical-json.test.ts` thoát 0 và báo pass toàn bộ test sau khi viết ở Task 1.2.

### Task 1.2 — Viết unit test toàn diện cho `canonicalJson`
- **Goal**: Đảm bảo `canonicalJson` hoạt động chính xác cho mọi trường hợp biên và không gây hồi quy.
- **Target files and symbols**: `apps/web/src/lib/canonical-json.test.ts` (tệp test mới).
- **Steps**:
  1. Tạo file `apps/web/src/lib/canonical-json.test.ts` sử dụng `vitest`.
  2. Viết các test case kiểm tra:
     - Tính độc lập với thứ tự key: `{ a: 1, b: 2 }` bằng `{ b: 2, a: 1 }`.
     - `null`, `undefined` và key vắng mặt trong object cho cùng kết quả: `{ stem: "Q1", type: null, pin: null }` bằng `{ stem: "Q1" }` và `{ stem: "Q1", type: undefined }`.
     - `null` trong mảng vẫn được bảo toàn: `canonicalJson([null, "a"])` khác `canonicalJson(["a"])` và `canonicalJson([])`.
     - `canonicalJson(null)` trả về `"null"`.
     - `canonicalJson(undefined)` trả về `"null"`.
     - Nhận diện sự khác nhau thực sự: khác `stem`, khác `answer`, khác `opts` (`opts: null` vs `opts: ["A"]`), khác `type` (`type: null` vs `type: "mcq"`), khác `pin` (`pin: null` vs `pin: { x: 10, y: 20 }`).
     - Nested object: object lồng nhau vẫn lọc đúng các thuộc tính `null`/`undefined`.
- **Success criteria**: Toàn bộ unit test trong `canonical-json.test.ts` đều pass.
- **Verify**: `pnpm --filter web exec vitest run src/lib/canonical-json.test.ts` thoát 0 và báo pass tất cả các test.

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
