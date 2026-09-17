---
phase: 1
title: "Remove mock data from reports and prefill modal"
status: completed
priority: P1
effort: "2h"
---

# Phase 1: Remove mock data from reports and prefill modal

## Overview

Loại bỏ hoàn toàn mock data hardcode khỏi route `/reports` và component `CreateReportModal`. Thay thế bằng dữ liệu thật derive từ `data.reports`, cung cấp empty state chuẩn khi account chưa có dữ liệu, và viết contract test ban-list để khóa vĩnh viễn không để mock data quay lại.

## Requirements

- [x] **Contract tests (TDD first):**
  - Cập nhật `apps/web/src/lib/kernel-runtime.contract.test.ts` với test kiểm tra `routes/_auth/reports.tsx`:
    - `not.toMatch(/Minh Anh/)`
    - `not.toMatch(/Quốc Bảo/)`
    - `not.toMatch(/18\/08/)`
    - `not.toMatch(/17\/08/)`
    - `not.toMatch(/4 báo cáo tuần này/)`
    - `not.toMatch(/Task 2 University/)`
    - `toMatch(/Chưa có báo cáo nào được gửi/)`
    - `toMatch(/Chưa có nhật ký gửi tin nhắn/)`
  - Thêm test kiểm tra `components/modals/create-report-modal.tsx`:
    - `not.toMatch(/DEFAULT_CONTENT/)`
    - `not.toMatch(/19–25\/08/)`
    - `not.toMatch(/Task 2 Opinion Essay/)`
    - `not.toMatch(/Bar chart/)`
    - `not.toMatch(/Band gần nhất/)`
- [x] **`apps/web/src/routes/_auth/reports.tsx`:**
  - Xóa bỏ hằng số `sendLog` tĩnh.
  - Derive `sendLog` động từ `data.reports`:
    ```ts
    const sendLog = data.reports
      .filter((r) => r.status === "sent" || r.status === "read")
      .map((r) => {
        const s = data.students.find((st) => st.id === r.sid);
        return {
          id: r.id,
          date: r.sent,
          title: `Báo cáo tuần → ${s?.name ?? "Học viên"}`,
          desc: r.read
            ? `Zalo OA · Phụ huynh đã mở ${r.read}`
            : "Zalo OA · Đã gửi",
          channel: "Zalo OA",
        };
      })
      .reverse();
    ```
  - Khi `data.reports.length === 0`:
    - Phần "Báo cáo đã gửi" hiển thị `<p className="font-mono text-meta text-xs">Chưa có báo cáo nào được gửi.</p>`.
  - Khi `data.reports.length > 0`:
    - Render `<Card variant="white" className="p-0"><DataTable ... /></Card>`.
  - Khi `sendLog.length === 0`:
    - Phần "Nhật ký gửi tin nhắn" hiển thị `<p className="font-mono text-meta text-xs">Chưa có nhật ký gửi tin nhắn.</p>`.
  - Khi `sendLog.length > 0`:
    - Render `<Card>{sendLog.map(...)}</Card>`.
  - `PageHead`:
    - Lead động: `lead={data.reports.length > 0 ? \`Gửi qua Zalo OA · \${data.reports.length} báo cáo\` : "Gửi qua Zalo OA"}`.
- [x] **`apps/web/src/components/modals/create-report-modal.tsx`:**
  - Xóa bỏ `const DEFAULT_CONTENT = ...`.
  - Đổi `useState("19–25/08")` thành `useState("")` và thêm `placeholder="VD: 01–07/09"`.
  - Đổi `useState(DEFAULT_CONTENT)` thành `useState("")` và thêm `placeholder="Nhập nội dung báo cáo..."`.
  - Cập nhật select học viên:
    - Nếu `data.students.length === 0`, hiển thị `<option value="">Chưa có học viên</option>`.

## Implementation Steps

1. **Test-First (TDD Red):**
   - Mở `apps/web/src/lib/kernel-runtime.contract.test.ts`.
   - Bổ sung test ban-list cho `reports.tsx` và `create-report-modal.tsx`.
   - Chạy `pnpm --filter web test` → xác nhận test fail do phát hiện `Minh Anh`, `Quốc Bảo`, `DEFAULT_CONTENT`, etc.
2. **Refactor `create-report-modal.tsx` (Green 1):**
   - Xóa `DEFAULT_CONTENT`.
   - Sửa default state của `period` và `content` thành `""`.
   - Thêm placeholders và placeholder `<option value="">Chưa có học viên</option>`.
3. **Refactor `reports.tsx` (Green 2):**
   - Xóa mảng tĩnh `sendLog`.
   - Derive `sendLog` từ `data.reports` có status `sent` / `read`.
   - Thêm empty states cho cả "Báo cáo đã gửi" và "Nhật ký gửi tin nhắn".
   - Sửa `PageHead lead` thành động.
4. **Verification (Green 3):**
   - Chạy `pnpm --filter web test` → xác nhận 100% tests pass.
   - Chạy `pnpm --filter web check-types` → xác nhận typecheck sạch không có lỗi.

## Todo

- [x] Viết failing contract tests trong `kernel-runtime.contract.test.ts`
- [x] Cập nhật `create-report-modal.tsx` (xóa DEFAULT_CONTENT, rỗng prefill)
- [x] Cập nhật `reports.tsx` (xóa mock sendLog, derive từ data.reports, thêm empty states)
- [x] Chạy full unit/contract tests và typecheck để xác nhận pass

## Success Criteria

- [x] Ban-list assertions pass trong contract test.
- [x] Không còn bất kỳ mock name/date nào trong `reports.tsx` và `create-report-modal.tsx`.
- [x] Account có 0 báo cáo hiển thị empty states sạch sẽ, không có số 4 hay ngày 17-18/08 hay 19-25/08.
- [x] `pnpm --filter web test` và `check-types` đều pass.
