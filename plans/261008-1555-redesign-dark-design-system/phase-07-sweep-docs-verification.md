---
phase: 7
title: "Sweep, DESIGN.md, e2e + screenshot 3 viewport × 2 theme"
status: pending
priority: P1
effort: "4h"
dependencies: [4, 5, 6]
---

# Phase 7: Sweep, tài liệu, xác minh toàn bộ

## Goal

Không còn màu/khung cũ sót lại ở cả hai theme; `DESIGN.md`/`REVIEW.md` mô tả hệ thống mới;
toàn bộ gate local và e2e xanh; PR có screenshot đủ ma trận.

## Files to Create / Modify

- Modify: `DESIGN.md` — viết lại theo design mới: bản chất ("Teacher-first workspace" giữ, đổi
  mô tả thị giác: dark-first, một accent cam), bảng token dark/light (tham chiếu
  `globals.css`, không chép toàn bộ), type (Inter Tight/DM Mono, tiêu đề extrabold −0.045em),
  radius, `neu`/`neu-sm`/`neu-in`, quy tắc selection mới (`neu-in text-hot` — **thay** quy tắc
  "selection = đen đặc"), trạng thái đơn sắc + cam, đỏ chỉ cho `destructive`, theme toggle +
  `theme-init.js` (lý do CSP), các lệch có chủ đích (light accent `#c93d0b`, overlay modal,
  passage weight thường, input `--line-strong`). Giữ phần Voice, cập nhật phần Don't.
- Modify: `REVIEW.md` — thêm mục: kiểm cả dark + light; focus ring cam; không có
  `bg-white`/hex ngoài whitelist; QR giữ nền trắng.
- Modify: `AGENTS.md` (mục "Quy ước UI") — chỉ khi câu chữ đang mâu thuẫn với DESIGN.md mới.
- Modify: `CHANGELOG.md` — mục `## <ngày merge>` → `### Changed`: redesign giao diện web +
  student theo design mới (dark mặc định, toggle sáng/tối, accent cam, font mới) `(#349)`.
- Sửa lẻ bất kỳ file nào grep dưới đây bắt được.

## Tasks & Steps

1. Grep sót (loại trừ test, `node_modules`, `routeTree.gen.ts`):
   - Hex cứng: `grep -rnE "#[0-9a-fA-F]{3,8}\b" apps/web/src apps/student/src packages/ui/src --include='*.tsx' --include='*.ts'`
     — whitelist: nền trắng/mực đen của QR (`payment-qr-panel.tsx`), SVG logo nếu có.
   - Màu Tailwind thô: `grep -rnE "\b(bg|text|border|ring|fill|stroke)-(white|black|gray|slate|zinc|neutral|blue|green|red|yellow|amber|emerald|sky)-?" …`
     — whitelist như trên.
   - Token cũ không còn ý nghĩa: `accent-blue` (phải 0), `rounded-full` trên nút (chỉ chip/avatar/toggle), `richColors`.
   - `text-danger` gắn với nút/link xóa → đổi `destructive`.
2. Contrast: chạy lại script đo của phase 1 cho mọi cặp token; thêm cặp phát sinh khi làm
   trang (ví dụ `text-meta` trên `neu-in`). Mọi chữ thường ≥ 4.5, chữ lớn/ranh giới ≥ 3.
3. Gate local:
   ```
   pnpm check
   pnpm check-types
   pnpm --filter web test
   pnpm --filter student test
   pnpm test:ci-workflow && pnpm test:topology-drift
   E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e
   ```
   Trước khi chạy e2e: kiểm port 8100/8101/8103 trống (`lsof -i :8101`), dừng tiến trình cũ do
   mình khởi động; không đụng dev stack 8000/8001/8003 của user.
4. Screenshot (built-in browser hoặc Playwright script tạm, không commit): 1440×900, 768×1024,
   375×812 × dark + light cho: login, dashboard, classes, class detail, students, student
   detail, schedule, assignments, test builder, grading, tuition, invoice detail, `/pay/$token`,
   student home, student reading exam, student writing, student results. Lưu vào
   `plans/261008-1555-redesign-dark-design-system/screenshots/` hoặc đính trực tiếp PR (không
   commit ảnh nặng nếu repo không có tiền lệ — kiểm `git log --stat -- '*.png' | head`).
5. Keyboard pass theo `REVIEW.md` ở dashboard, assignments (chip lọc), grading (slider),
   student exam (lựa chọn T/F/NG), theme toggle.
6. Cập nhật status các phase + `plan.md`; điền "Ghi chú lệch design" còn trống.

## Verification

- Mọi lệnh ở bước 3 exit 0.
- Grep ở bước 1 chỉ còn mục trong whitelist.
- Bảng contrast trong phase 1 đầy đủ, không cặp nào dưới ngưỡng.
- Screenshot đủ ma trận đính vào PR.

## Rollback

Phase chỉ sửa lẻ + docs; revert commit tương ứng.
