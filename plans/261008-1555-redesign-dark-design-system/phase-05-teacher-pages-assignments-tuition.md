---
phase: 5
title: "Trang giáo viên: bài tập, đề thi, chấm bài, học phí"
status: pending
priority: P2
effort: "6h"
dependencies: [3]
---

# Phase 5: Trang giáo viên — bài tập, đề thi, chấm bài, học phí

## Goal

Nhóm trang nội dung IELTS và tài chính khớp design (`Assignments`, `TestBuilder`, `Grading`,
`Tuition`, `InvoiceDetail` trong `src/pages/Teacher.tsx`). Đây là nhóm UI dày nhất
(`assignments/new.tsx` 558 dòng, `tuition/$invoiceId.tsx` 388 dòng); ưu tiên đổi qua
primitive, chỉ sửa layout nơi design khác rõ.

Áp dụng "Quy tắc chung" ở [phase 4](./phase-04-teacher-pages-core.md#quy-tắc-chung-cho-mọi-trang).

## Ánh xạ trang

| Route | File (tương đối `apps/web/src/`) | Design | Thay đổi chính |
|---|---|---|---|
| `/assignments` | `routes/_auth/assignments/index.tsx`, `components/ui/chip-filter.tsx` (đã đổi ở phase 2), `components/assignments/status-tag.tsx` | `Assignments` | kicker "Ngân hàng đề"; `action` = nút tạo; bộ lọc skill dạng nút `neu-sm` liền nhau, part theo nhóm có nhãn mono (giữ taxonomy 2 cấp, filter trong URL, debounce search — AGENTS.md); bảng: cột `#` mono `text-meta`, định dạng câu hỏi `Tag`, đáp án mono |
| `/assignments/new`, `/assignments/$assignmentId` | `routes/_auth/assignments/new.tsx`, `$assignmentId.tsx`, `components/assignments/*` (composer, editors, preview aside) | (không vẽ riêng — dùng ngôn ngữ `TestBuilder`) | card `neu`, nhãn mono, input `neu-in`; preview aside `neu rounded-lg`; thông báo thành công (`create-success-card.tsx`) kiểu design: `border-l-4 border-hot neu-in rounded-md` |
| `/assignments/tests/new`, `/assignments/tests/$id` (test builder) | `routes/_auth/assignments/tests/*`, `components/assignment-tests/*` | `TestBuilder` | 2 cột `[1fr_1.3fr]`: ngân hàng (hàng `border-t`, `Tag` skill, hover cam) và đề (card `neu`, số thứ tự extrabold xl, meta `text-meta text-xs`, nút gỡ `✕` hover cam); nhãn cột mono uppercase |
| `/assignments/preview`, `/assignments/tests/preview` | `routes/_auth/assignments/preview.tsx`, `tests/preview.tsx`, `components/assignments/preview-quiz-simulation.tsx`, `student-preview-paper.tsx` | modal "Simulation preview" | thanh đầu bài `neu-in rounded-md font-mono text-xs` (kỹ năng ↔ đồng hồ); paper dùng component quiz chung (phase 6) |
| `/grading/$attemptId` | `routes/_auth/grading/$attemptId.tsx`, `components/grading/*`, `modals/grade-modal.tsx` | `Grading` | `action` = "Band tổng" mono nhãn + số extrabold 8xl cam; 2 cột `[1.3fr_1fr]`; bài viết `text-lg leading-[1.9] border-l-2 border-line pl-5` (weight thường, xem plan.md rủi ro), highlight dùng `mark.anno` + số chú thích `sup` mono cam; ngân hàng nhận xét = nút `neu-sm`; tiêu chí: tên + điểm mono lg + slider `accent-color: var(--accent)`; nút trả kết quả `primary` full width |
| `/tuition` | `routes/_auth/tuition/index.tsx`, `components/tuition/revenue-chart.tsx`, `invoice-status-cell.tsx`, `modals/add-invoice-modal.tsx`, `invoice-payment-modal.tsx`, `edit-class-fee-modal.tsx` | `Tuition` | kicker "Doanh thu · VietQR qua SePay"; stat tiles 2×2 (`hot` cho số còn phải thu); chart: cột thường `var(--chip)`, cột kỳ hiện tại/đang chọn `var(--accent)`, nhãn trục mono `var(--meta)`, tooltip `neu`; bảng hóa đơn: mã chuyển khoản mono underline hover cam; trạng thái → `Badge` (đã đóng = chip, một phần = viền ink, chưa đóng = viền đứt, quá hạn = cam đặc) |
| `/tuition/$invoiceId` | `routes/_auth/tuition/$invoiceId.tsx` | `InvoiceDetail` | tiêu đề = mã hóa đơn; 3 `StatCard` (Số tiền / Đã thu / Còn lại `hot` khi > 0); bảng giao dịch khớp (thời gian + nội dung mono); QR trong card `neu` bên phải, **giữ nền trắng** quanh QR |

## Tasks & Steps

1. `chip-filter` + `/assignments` trước (pattern lọc dùng lại ở test builder).
2. Composer/editors: chỉ rà class lệch (radius lớn, `bg-white`, viền xanh) — không tái cấu trúc.
3. Grading: kiểm `annotatable-essay` vẫn chọn text/annotate đúng sau khi đổi font/size
   (`annotatable-essay.test.tsx`, `teacher-essay-annotations.spec.ts`).
4. Tuition + chart: đổi `fill`/`stroke` sang token; kiểm `tuition-revenue-chart.spec.ts` không
   bám màu. Badge trạng thái: một nguồn ánh xạ status → variant (tìm chỗ map hiện có trong
   `invoice-status-cell.tsx` / `assignment-status.ts`, không nhân bản).
5. Selector e2e bám class: giữ class móc `assign-item`; `tuition-revenue-chart` và
   `create-invoice` (`.grid.grid-cols-3 > div`, `div.mt-8`) → đổi sang role/label/testid cùng
   commit đổi markup (bảng "E2E bám class" trong [plan.md](./plan.md)).
6. Nút xóa/hủy hóa đơn, xóa câu hỏi, xóa đề → `destructive`.

## Verification

- `pnpm --filter web test` (toàn bộ `components/assignments`, `assignment-tests`, `grading`,
  `routes/_auth/assignments/*.test.tsx`, `tuition/$invoiceId.test.tsx`).
- E2E (port override): `assignment-*`, `rich-text-content`, `teacher-essay-annotations`,
  `teacher-grade-submission`, `create-invoice`, `invoice-detail`, `tuition-bank-transfer`,
  `tuition-revenue-chart`, `class-tuition-fee`, `class-assign`.

## Ghi chú lệch design

_(điền khi thực thi)_

## Rollback

Revert commit phase 5; độc lập với phase 4/6.
