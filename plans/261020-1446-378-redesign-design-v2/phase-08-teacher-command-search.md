---
phase: 8
title: "Giáo viên: ô tìm kiếm ⌘K (mới)"
status: pending
priority: P2
effort: "4h"
dependencies: [4]
---

# Phase 8: Ô tìm kiếm ⌘K

## Goal

Ô "Tìm kiếm… ⌘K" ở header như design v2, mở command palette tìm lớp, học viên, bài tập, hóa
đơn và trang (nav) rồi điều hướng tới route thật.

## Files to Create / Modify

- Create: `apps/web/src/components/command-search/command-search.tsx` — trigger (nút `h-8 w-56`
  + `Kbd ⌘K`, ẩn dưới `md`, dưới `md` thành nút icon) + dialog palette.
- Create: `apps/web/src/components/command-search/search-index.ts` — dựng chỉ mục từ
  `lib/data-store.tsx` (kernel snapshot đã có ở client): classes, students, assignments,
  invoices + mục nav; chuẩn hóa bỏ dấu tiếng Việt khi so khớp.
- Create: `search-index.test.ts`, `command-search.test.tsx`.
- Modify: `apps/web/src/components/layout/topbar.tsx` (hoặc actions của shell) — gắn trigger.
- Dependency: dùng `cmdk` qua shadcn `Command` nếu `packages/ui` chưa có — thêm
  `packages/ui/src/components/command.tsx` (shadcn) và `cmdk` vào `packages/ui/package.json`.

## Tasks & Steps

1. Phím tắt `⌘K`/`Ctrl+K` toàn cục (bỏ qua khi focus trong input/editor có xử lý riêng).
2. Kết quả nhóm theo loại có nhãn, tối đa 5/nhóm, Enter điều hướng bằng router, Esc đóng,
   focus trả về trigger; `aria-live` cho số kết quả.
3. Không gọi API mới — chỉ đọc store; dữ liệu chưa tải → trạng thái "Đang tải…".
4. Test: tìm "huy" khớp "Lê Quang Huy"; tìm "lop 7" khớp "Lớp 7"; Enter → đúng route.

## Verification

- `pnpm --filter web test -- command-search`
- e2e mới `apps/e2e/specs/teacher-command-search.spec.ts`: ⌘K → gõ tên học viên seed → Enter →
  URL `/students/$id`.
- `pnpm design:compare --screens t-search --side app --label new` → PASS.
